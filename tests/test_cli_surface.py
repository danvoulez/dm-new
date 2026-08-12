from lab import cli
from lab.store import connect, get


def run_cli(tmp_path, monkeypatch, argv):
    monkeypatch.setattr(cli, "DB", str(tmp_path / "lab.sqlite"))
    return cli.run(cli.build_parser().parse_args(argv))


def test_doctor_reports_fresh_lab_command_surface(tmp_path, monkeypatch):
    out = run_cli(tmp_path, monkeypatch, ["doctor"])

    assert out["ok"] is True
    assert out["ledger"] == "logline_acts"
    assert out["commands"]["emit"] == "deprecated"
    assert "wake-spec" in out["commands"]["selector"]


def test_wake_spec_inspects_addressed_records_without_dispatch(tmp_path, monkeypatch):
    act = run_cli(
        tmp_path,
        monkeypatch,
        [
            "act",
            "--who",
            "tester",
            "--did",
            "registered",
            "--this",
            "arrival",
            "--confirmed_by",
            "test",
            "--if_ok",
            "agent-frequency",
            "--if_doubt",
            "attention-raise.v1",
            "--if_not",
            "stop",
            "--status",
            "registered",
        ],
    )

    out = run_cli(tmp_path, monkeypatch, ["wake-spec", "agent-frequency"])

    assert out["frequency"] == "agent-frequency"
    assert out["addressed"] == 1
    assert out["hashes"] == [act["id"]]
    assert out["effect"] == "no_direct_execution"


def test_wake_handled_and_wake_receipt_write_canonical_records(tmp_path, monkeypatch):
    source = run_cli(
        tmp_path,
        monkeypatch,
        [
            "act",
            "--who",
            "tester",
            "--did",
            "registered",
            "--this",
            "arrival",
            "--confirmed_by",
            "test",
            "--if_ok",
            "memory-register.v1",
            "--if_doubt",
            "attention-raise.v1",
            "--if_not",
            "stop",
            "--status",
            "registered",
        ],
    )

    handled = run_cli(tmp_path, monkeypatch, ["wake-handled", source["id"]])
    receipt = run_cli(
        tmp_path,
        monkeypatch,
        [
            "wake-receipt",
            source["id"],
            "--did",
            "selected",
            "--status",
            "queued",
            "--if-ok",
            "memory-register.v1",
            "--data",
            '{"queue_id":"queue:test"}',
        ],
    )
    db = connect(tmp_path / "lab.sqlite")

    assert handled["did"] == "wake_handled"
    assert handled["this"] == source["id"]
    assert get(db, handled["id"])["status"] == "fechado"
    assert receipt["did"] == "selected"
    assert receipt["this"] == source["id"]
    assert receipt["queue_id"] == "queue:test"
    assert get(db, receipt["id"])["status"] == "queued"


def test_executor_daemon_alias_runs_single_safe_iteration(tmp_path, monkeypatch):
    out = run_cli(tmp_path, monkeypatch, ["executor", "daemon"])

    assert out == {"mode": "daemon", "ran": 0, "result": None}


def test_queue_rebuild_accepts_from_to_window(tmp_path, monkeypatch):
    old = run_cli(
        tmp_path,
        monkeypatch,
        ["schedule", "registered", "old", "--at", "2026-06-21T23:00:00Z", "--process", "memory-register.v1"],
    )
    inside = run_cli(
        tmp_path,
        monkeypatch,
        ["schedule", "registered", "inside", "--at", "2026-06-22T00:30:00Z", "--process", "memory-register.v1"],
    )

    out = run_cli(
        tmp_path,
        monkeypatch,
        ["queue", "rebuild", "--from", "2026-06-22T00:00:00Z", "--to", "2026-06-22T01:00:00Z"],
    )

    assert out["authoritative"] is False
    assert out["queued"] == 1
    assert out["items"][0]["hash"] == inside["id"]
    assert old["id"] != inside["id"]
