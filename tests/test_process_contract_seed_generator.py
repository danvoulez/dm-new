from pathlib import Path
import subprocess
import sys


def test_seed_rows_preserve_contract_semantics():
    from tools.generate_process_contract_seeds import seed_rows

    rows = seed_rows(Path("processes"))
    projection = next(row for row in rows if row["process_id"] == "projection-build.v1")

    assert projection["contract"]["activation_rules_explicit"] is True
    assert projection["contract"]["slot_rules"]["who"]["source"] == "session"
    assert projection["contract"]["slot_rules"]["who"]["predicate"] == "who.authorized"
    assert projection["contract"]["slot_rules"]["did"]["values"] == (
        "request_projection", "build_projection"
    )


def test_generated_artifacts_are_in_sync():
    from tools.generate_process_contract_seeds import generated_artifacts

    artifacts = generated_artifacts(Path("."))

    assert artifacts[Path("workers/api/src/seed-contracts.ts")] == Path(
        "workers/api/src/seed-contracts.ts"
    ).read_text(encoding="utf-8")
    assert artifacts[Path("migrations/0004_process_contracts.sql")] == Path(
        "migrations/0004_process_contracts.sql"
    ).read_text(encoding="utf-8")


def test_generator_check_uses_the_current_checkout():
    result = subprocess.run(
        [sys.executable, "tools/generate_process_contract_seeds.py", "--check"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
