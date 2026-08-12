"""LogLine Foundation conformance runner.

Runs the upstream Node reference verifier against the conformance corpus kept under
``tests/fixtures/logline-foundation/``.  The Lab does not reimplement the Foundation
Canon; it proves its own minted receipts pass the reference verifier.
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .receipt import canonical_json
from .resources import resource_path

FOUNDATION_ROOT_DEFAULT = "tests/fixtures/logline-foundation"


def _run_node(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    # Resolve to an absolute path: the script path must not be re-resolved against cwd,
    # which is itself set inside the conformance tree.
    conformance = (Path(repo) / "conformance").resolve()
    return subprocess.run(
        ["node", str(conformance / "tools" / "verify-receipt.mjs"), *args],
        cwd=conformance,
        capture_output=True,
        text=True,
        check=False,
    )


def _suite_counts(stdout: str) -> tuple[int, int]:
    match = re.search(r"(\d+) passed, (\d+) failed", stdout)
    if not match:
        return 0, 1
    return int(match.group(1)), int(match.group(2))


def verify_foundation_suite(root: str | Path = FOUNDATION_ROOT_DEFAULT) -> dict[str, Any]:
    repo = resource_path(str(root)) if str(root) == FOUNDATION_ROOT_DEFAULT else Path(root)
    proc = _run_node(repo, "--suite")
    passed, failed = _suite_counts(proc.stdout)
    return {
        "ok": proc.returncode == 0 and failed == 0,
        "root": str(repo),
        "passed": passed,
        "failed": failed,
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def verify_engine_receipt(receipt: dict[str, Any], root: str | Path = FOUNDATION_ROOT_DEFAULT) -> dict[str, Any]:
    repo = resource_path(str(root)) if str(root) == FOUNDATION_ROOT_DEFAULT else Path(root)
    with tempfile.TemporaryDirectory() as tmp:
        receipt_path = Path(tmp) / "receipt.json"
        receipt_path.write_text(canonical_json(receipt), encoding="utf-8")
        proc = _run_node(repo, str(receipt_path))
    kind = "receipt" if "receipt" in proc.stdout else "unknown"
    return {
        "ok": proc.returncode == 0,
        "kind": kind,
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def verify_receipt_file(path: str | Path, root: str | Path = FOUNDATION_ROOT_DEFAULT) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        receipt = json.load(handle)
    return verify_engine_receipt(receipt, root)
