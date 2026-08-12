"""Bench bootstrap — reproducible local ledger, safe reset, genesis, and mode (Day 2 §3-6).

The bench is a *workbench*, never the real Lab. These helpers let a fresh machine create a
clean local ledger from nothing, reset it without any chance of touching production, begin
every bench ledger with an explicit genesis act, and gate destructive work behind
``LAB_MODE=bench``. See ``docs/BENCH_VS_BOOTSTRAP.md``.

Authority note: the bench SQLite store has no RLS / service_role membrane (see
``reports/day2/sqlite_postgres_parity.md``). A bench ledger must therefore NEVER be treated
as real authority — every act written here is stamped ``lab_mode=bench``.
"""
from __future__ import annotations

import os
import platform
import socket
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .errors import BootstrapError
from .store import SCHEMA_VERSION, append, connect, count, get

BENCH_MODE = "bench"
BOOTSTRAP_MODE = "bootstrap"
PRODUCTION_MODE = "production"
KNOWN_MODES = {BENCH_MODE, BOOTSTRAP_MODE, PRODUCTION_MODE}

GENESIS_DID = "genesis"
DEFAULT_BENCH_DB = ".lab/test.sqlite"
# The real local ledger name — reset must never target it.
PROTECTED_DB_NAMES = {"lab.sqlite"}


def lab_mode() -> str:
    """Current operating mode, defaulting to the safe bench. Read live (not at import)."""
    return os.environ.get("LAB_MODE", BENCH_MODE) or BENCH_MODE


def package_version() -> str:
    """Best-effort package version for the genesis record (no hard dependency)."""
    try:
        from importlib.metadata import PackageNotFoundError, version

        try:
            return version("dream-machine")
        except PackageNotFoundError:
            pass
    except Exception:  # pragma: no cover - importlib always present on py311
        pass
    # Fallback: read pyproject.toml relative to the repo, if present.
    try:
        import tomllib

        pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
        if pyproject.exists():
            data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
            return str(data.get("project", {}).get("version", "0.0.0+local"))
    except Exception:
        pass
    return "0.0.0+local"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _machine_context() -> dict[str, Any]:
    """Non-secret local identity for the genesis record."""
    return {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "python": platform.python_version(),
    }


def _healthy(db: sqlite3.Connection, db_path: str, *, created: bool) -> dict[str, Any]:
    row = db.execute("SELECT value FROM schema_meta WHERE key = 'schema_version'").fetchone()
    schema_version = int(row["value"]) if row else None
    return {
        "ok": True,
        "mode": lab_mode(),
        "db": db_path,
        "schema_version": schema_version,
        "count": count(db),
        "created": created,
        "healthy": schema_version == SCHEMA_VERSION,
    }


def bootstrap_local(path: str = DEFAULT_BENCH_DB) -> dict[str, Any]:
    """§3 — Create (or open) a clean local bench ledger and report it healthy.

    Idempotent: ``connect`` applies the schema with ``CREATE TABLE IF NOT EXISTS``, so a
    repeat run neither errors nor wipes existing data.
    """
    existed = path != ":memory:" and Path(path).exists()
    db = connect(path)
    try:
        return _healthy(db, path, created=not existed)
    finally:
        db.close()


def _assert_safe_bench_target(path: str, repo_root: str | Path | None) -> Path:
    """§4 — Refuse any reset target that could be production or a generic location."""
    if lab_mode() != BENCH_MODE:
        raise BootstrapError(f"reset-bench refused: LAB_MODE={lab_mode()!r}, not 'bench'")
    raw = str(path or "").strip()
    if not raw:
        raise BootstrapError("reset-bench refused: empty path")
    resolved = Path(raw).expanduser().resolve()
    if resolved in {Path("/").resolve(), Path.home().resolve()}:
        raise BootstrapError(f"reset-bench refused: refuses HOME/root ({resolved})")
    if resolved.is_dir():
        raise BootstrapError(f"reset-bench refused: target is a directory ({resolved})")
    lab_dir = (Path(repo_root) if repo_root is not None else Path.cwd()).resolve() / ".lab"
    if not resolved.is_relative_to(lab_dir):
        raise BootstrapError(f"reset-bench refused: target {resolved} is outside {lab_dir}")
    if resolved.suffix != ".sqlite":
        raise BootstrapError(f"reset-bench refused: not a .sqlite file ({resolved})")
    if resolved.name in PROTECTED_DB_NAMES:
        raise BootstrapError(f"reset-bench refused: {resolved.name} is the real local ledger")
    return resolved


def reset_bench(path: str = DEFAULT_BENCH_DB, *, repo_root: str | Path | None = None) -> dict[str, Any]:
    """§4 — Delete the bench DB (only ever a bench DB) and recreate an empty schema.

    Safe by construction: the target must be a ``.sqlite`` file inside ``<repo>/.lab``,
    must not be the protected real ledger, and LAB_MODE must be ``bench``. The resolved
    target is reported so the caller always sees exactly what was removed.
    """
    resolved = _assert_safe_bench_target(path, repo_root)
    removed = resolved.exists()
    if removed:
        resolved.unlink()
    db = connect(str(resolved))  # recreate schema
    try:
        result = _healthy(db, str(resolved), created=True)
    finally:
        db.close()
    result["reset"] = str(resolved)
    result["removed_existing"] = removed
    return result


def genesis_local(db: sqlite3.Connection, *, identity: str | None = None) -> dict[str, Any]:
    """§5 — Register the explicit origin act of a bench ledger (idempotent, first-only)."""
    existing = db.execute(
        "SELECT content_hash FROM logline_acts WHERE did = ? LIMIT 1", (GENESIS_DID,)
    ).fetchone()
    if existing:
        return get(db, existing["content_hash"])
    if count(db) > 0:
        raise BootstrapError("genesis refused: ledger already has acts but no genesis")
    who = identity or socket.gethostname()
    return append(
        db,
        {
            "who": who,
            "did": GENESIS_DID,
            "this": "lab.bench.genesis",
            "when": _now(),
            "confirmed_by": who,
            "if_ok": "memory-register.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "registered",
            "lab_mode": BENCH_MODE,
            "package_version": package_version(),
            "schema_version": SCHEMA_VERSION,
            "machine_context": _machine_context(),
        },
    )


def bench_status(db: sqlite3.Connection, db_path: str = DEFAULT_BENCH_DB) -> dict[str, Any]:
    """§6 — A glanceable bench state: mode, db, count, and whether genesis exists."""
    genesis = db.execute(
        "SELECT content_hash FROM logline_acts WHERE did = ? LIMIT 1", (GENESIS_DID,)
    ).fetchone()
    status = _healthy(db, db_path, created=False)
    status["has_genesis"] = genesis is not None
    status["genesis_hash"] = genesis["content_hash"] if genesis else None
    return status
