import json
import os
import subprocess
import sys

from lab.foundation import verify_engine_receipt, verify_foundation_suite
from lab.receipt import mint


def test_foundation_suite_runs_from_bundled_zip():
    result = verify_foundation_suite()

    assert result["ok"], result
    assert result["passed"] == 21
    assert result["failed"] == 0


def test_engine_minted_receipt_passes_foundation_reference_verifier():
    receipt = mint(
        {
            "who": "tester",
            "did": "registered",
            "this": "foundation",
            "when": "2026-06-22T00:00:00Z",
            "confirmed_by": "test",
            "if_ok": "memory-register.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "registered",
        }
    )

    result = verify_engine_receipt(receipt)

    assert result["ok"], result
    assert result["kind"] == "receipt"


def test_tampered_receipt_fails_foundation_reference_verifier():
    receipt = mint({"who": "tester"})
    receipt["who"] = "tampered"

    result = verify_engine_receipt(receipt)

    assert result["ok"] is False
    assert "FAILED" in result["stdout"]


def test_foundation_cli_verifies_engine_receipt(tmp_path):
    receipt_path = tmp_path / "receipt.json"
    receipt_path.write_text(json.dumps(mint({"who": "tester"})))
    proc = subprocess.run(
        [sys.executable, "-m", "lab.cli", "foundation", "verify-receipt", str(receipt_path)],
        cwd=os.getcwd(),
        env=os.environ | {"LAB_DB": str(tmp_path / "lab.sqlite")},
        check=True,
        capture_output=True,
        text=True,
    )
    result = json.loads(proc.stdout)

    assert result["ok"] is True
    assert result["kind"] == "receipt"
