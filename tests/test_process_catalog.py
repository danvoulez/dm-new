import json
import os
import subprocess
import sys
from pathlib import Path

from lab.process_catalog import build_process_catalog, build_runnable_processes, render_process_catalog, render_runnable_processes


def test_process_catalog_is_generated_from_contract_files():
    catalog = build_process_catalog("processes")
    ids = [item["process_id"] for item in catalog["processes"]]

    assert "memory-register.v1" in ids
    assert "inference.v1" in ids
    assert "worker-run.v1" in ids
    assert ids == sorted(ids)
    worker = next(item for item in catalog["processes"] if item["process_id"] == "worker-run.v1")
    assert worker["danger_tier"] == "L4"
    assert worker["adapters"] == ["worker_run"]


def test_runnable_processes_reflect_adapter_and_grant_readiness():
    runnable = build_runnable_processes("processes")
    rows = {item["process_id"]: item for item in runnable["processes"]}

    assert rows["memory-register.v1"]["status"] == "runnable"
    assert rows["projection-build.v1"]["status"] == "runnable"
    assert rows["inference.v1"]["status"] == "runnable"
    assert rows["worker-run.v1"]["status"] == "blocked"
    assert rows["worker-run.v1"]["reason"] == "requires grant/budget/sandbox"
    assert rows["workflow-run.v1"]["status"] == "blocked"
    # §21 — route-to-devin is now L4 (dangerous external delegation): grant-gated, blocked.
    assert rows["route-to-devin.v1"]["status"] == "blocked"
    assert rows["route-to-devin.v1"]["reason"] == "requires grant/budget/sandbox"
    # §20 — notification is now L5 (irreversible outbound): blocked.
    assert rows["notification.v1"]["status"] == "blocked"


def test_rendered_catalogs_include_generated_warning_and_tables():
    catalog_md = render_process_catalog(build_process_catalog("processes"))
    runnable_md = render_runnable_processes(build_runnable_processes("processes"))

    assert "Generated from `processes/*.v1.yml`" in catalog_md
    assert "| Process | Status | Adapter(s) | Danger |" in catalog_md
    assert "| worker-run.v1 | active | worker_run | L4 |" in catalog_md
    assert "Do not hand-edit" in runnable_md
    assert "| worker-run.v1 | blocked | requires grant/budget/sandbox |" in runnable_md


def test_process_generate_cli_writes_catalog_files(tmp_path):
    out_dir = tmp_path / "processes"
    out_dir.mkdir()
    env = os.environ | {"LAB_DB": str(tmp_path / "lab.sqlite")}
    proc = subprocess.run(
        [sys.executable, "-m", "lab.cli", "process", "generate", "--root", "processes", "--out", str(out_dir)],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    result = json.loads(proc.stdout)

    assert result["generated"] == ["PROCESS_CATALOG.md", "CURRENT_RUNNABLE_PROCESSES.md"]
    assert (out_dir / "PROCESS_CATALOG.md").exists()
    assert (out_dir / "CURRENT_RUNNABLE_PROCESSES.md").exists()
    assert "worker-run.v1 | blocked" in (out_dir / "CURRENT_RUNNABLE_PROCESSES.md").read_text()
