import json
import os
import subprocess
import sys

import pytest

from lab.errors import LabError
from lab.projections import project_build, project_descend, project_inspect, project_verify
from lab.store import append, connect


def full(**extra):
    base = {
        "who": "tester",
        "did": "registered",
        "this": "projectable",
        "when": "2026-06-22T00:00:00Z",
        "confirmed_by": "test",
        "if_ok": "memory-register.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "stop",
        "status": "registered",
    }
    base.update(extra)
    return base


def test_projection_builds_non_authoritative_rebuildable_doc_from_ledger():
    db = connect(":memory:")
    act = append(db, full())

    projection = project_build(db, "lab_current_state")

    assert projection["authoritative"] is False
    assert projection["rebuildable"] is True
    assert projection["class"] == "stable"
    assert projection["projection_spec"] == "lab_current_state"
    assert projection["input_hashes"] == [act["id"]]
    assert projection["counts"]["acts"] == 1
    assert project_inspect(db, projection["projection_hash"]) == projection
    assert project_verify(db)["ok"] is True


def test_projection_table_can_be_deleted_and_rebuilt_from_ledger():
    db = connect(":memory:")
    append(db, full(this="first"))
    first = project_build(db, "lab_current_state")
    db.execute("DROP TABLE projection_docs")
    db.commit()

    rebuilt = project_build(db, "lab_current_state")

    assert rebuilt["projection_hash"] == first["projection_hash"]
    assert rebuilt["input_hashes"] == first["input_hashes"]
    assert project_inspect(db, rebuilt["projection_hash"]) == rebuilt


def test_dynamic_projection_requires_pin_and_records_ladder_metadata():
    db = connect(":memory:")
    parent = project_build(db, "lab_current_state")

    with pytest.raises(LabError, match="dynamic projections require pin"):
        project_build(db, "dream_context", projection_class="dynamic")

    dynamic = project_build(
        db,
        "dream_context",
        projection_class="dynamic",
        pin={"model": "local", "prompt": "summarize.v1", "params": {"temperature": 0}, "seed": "0"},
        parent_projection_hashes=[parent["projection_hash"]],
        ladder_level="L1",
    )

    assert dynamic["class"] == "dynamic"
    assert dynamic["pin"]["model"] == "local"
    assert dynamic["parent_projection_hashes"] == [parent["projection_hash"]]
    assert project_descend(db, parent["projection_hash"])["children"][0]["projection_hash"] == dynamic["projection_hash"]


def test_project_cli_build_inspect_verify(tmp_path):
    db_path = tmp_path / "lab.sqlite"
    env = os.environ | {"LAB_DB": str(db_path)}
    base_cmd = [sys.executable, "-m", "lab.cli"]
    subprocess.run(
        [
            *base_cmd,
            "act",
            "--who",
            "tester",
            "--did",
            "registered",
            "--this",
            "cli",
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
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    built = subprocess.run(
        [*base_cmd, "project", "build", "lab_current_state"],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    projection = json.loads(built.stdout)
    inspected = subprocess.run(
        [*base_cmd, "project", "inspect", projection["projection_hash"]],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    verified = subprocess.run(
        [*base_cmd, "project", "verify"],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    assert json.loads(inspected.stdout)["projection_hash"] == projection["projection_hash"]
    assert json.loads(verified.stdout)["ok"] is True


def test_projection_process_materializes_visible_projection_through_executor():
    from lab.runtime import executor_run_once, queue_add
    from lab.store import append, get

    db = connect(":memory:")
    source = append(db, {
        "who": "tester", "did": "build_projection", "this": "lab",
        "when": "2026-08-12T00:00:00Z", "confirmed_by": "tester",
        "if_ok": "projection-build.v1", "if_doubt": "attention-raise.v1",
        "if_not": "stop", "status": "registered", "projection_spec": "runtime_visible",
        "process_id": "projection-build.v1",
    })
    queue_add(db, source["id"], "projection-build.v1", adapter="projection")
    closed = executor_run_once(db)
    result = get(db, closed["result_hash"])

    assert result["status"] == "fechado"
    assert result["projection_hashes"]
    projection = project_inspect(db, result["projection_hashes"][0])
    assert projection["projection_spec"] == "runtime_visible"
    assert projection["authoritative"] is False
    assert projection["rebuildable"] is True
