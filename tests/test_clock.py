from lab.runtime import clock_now, clock_select_due, executor_run_once, queue_list
from lab.store import append, connect, get


def scheduled(**extra):
    base = {
        "who": "tester",
        "did": "registered",
        "this": "scheduled-work",
        "when": "2026-06-22T00:00:00Z",
        "confirmed_by": "test",
        "if_ok": "memory-register.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "stop",
        "status": "scheduled",
        "process_id": "memory-register.v1",
    }
    base.update(extra)
    return base


def test_clock_tick_queues_due_complete_record_without_executing():
    db = connect(":memory:")
    act = append(db, scheduled())
    selected = clock_select_due(db, now_at="2026-06-22T00:01:00Z")
    assert selected[0]["hash"] == act["id"]
    assert selected[0]["queued"]["source_hash"] == act["id"]
    assert queue_list(db)[0]["status"] == "queued"
    assert get(db, act["id"])["status"] == "scheduled"


def test_clock_tick_is_idempotent_and_executor_is_separate():
    db = connect(":memory:")
    append(db, scheduled())
    first = clock_select_due(db, now_at="2026-06-22T00:01:00Z")
    second = clock_select_due(db, now_at="2026-06-22T00:01:00Z")
    assert first[0]["queued"]["queue_id"] == second[0]["queued"]["queue_id"]
    assert len(queue_list(db, "all")) == 1
    closed = executor_run_once(db)
    assert closed["status"] == "closed"


def test_clock_does_not_queue_future_or_incomplete_records():
    db = connect(":memory:")
    future = append(db, scheduled(when="2026-06-22T01:00:00Z"))
    incomplete = append(db, scheduled(who=""))
    selected = clock_select_due(db, now_at="2026-06-22T00:01:00Z")
    assert [item["hash"] for item in selected] == [incomplete["id"]]
    assert selected[0]["queued"] is None
    assert queue_list(db, "all") == []
    assert get(db, future["id"])["status"] == "scheduled"


def test_clock_backfill_window_selects_only_window_records():
    db = connect(":memory:")
    older = append(db, scheduled(when="2026-06-21T23:00:00Z", this="older"))
    inside = append(db, scheduled(when="2026-06-22T00:30:00Z", this="inside"))
    selected = clock_select_due(db, from_time="2026-06-22T00:00:00Z", to_time="2026-06-22T01:00:00Z")
    assert [item["hash"] for item in selected] == [inside["id"]]
    assert queue_list(db)[0]["source_hash"] == inside["id"]
    assert get(db, older["id"])["status"] == "scheduled"


def test_clock_raises_durable_idempotent_doubt_for_due_incomplete_record():
    db = connect(":memory:")
    # Due (now past its when) but incomplete: a scheduled wake that cannot fire must
    # become a durable doubt, not silently return an in-memory decision.
    act = append(db, scheduled(who=""))
    first = clock_select_due(db, now_at="2026-06-22T00:01:00Z")
    second = clock_select_due(db, now_at="2026-06-22T00:01:00Z")

    assert first[0]["queued"] is None
    assert first[0]["doubt"]
    assert second[0]["doubt"] == first[0]["doubt"]  # idempotent

    doubts = db.execute(
        "SELECT 1 FROM logline_acts WHERE did='doubt' AND this=?", (act["id"],)
    ).fetchall()
    assert len(doubts) == 1

    doubt = get(db, first[0]["doubt"])
    assert doubt["status"] == "doubted"
    assert doubt["who"] == "runtime.clock"


def test_clock_future_due_records_do_not_doubt():
    db = connect(":memory:")
    # A not-yet-due scheduled row is not a rung tap: it must stay silent (no doubt).
    append(db, scheduled(when="2026-06-22T01:00:00Z"))
    clock_select_due(db, now_at="2026-06-22T00:01:00Z")
    count = db.execute("SELECT COUNT(*) c FROM logline_acts WHERE did='doubt'").fetchone()["c"]
    assert count == 0


def test_clock_now_reports_selector_boundary():
    assert clock_now()["effect"] == "no_direct_execution"


def test_queue_rebuild_restores_due_work_after_projection_loss():
    from lab.runtime import queue_rebuild_due

    db = connect(":memory:")
    act = append(db, scheduled())
    queue_list(db, "all")
    db.execute("DROP TABLE runtime_queue")
    db.commit()
    rebuilt = queue_rebuild_due(db, now_at="2026-06-22T00:01:00Z")
    assert rebuilt["authoritative"] is False
    assert rebuilt["rebuilt_from"] == "logline_acts"
    assert rebuilt["queued"] == 1
    assert queue_list(db)[0]["source_hash"] == act["id"]
