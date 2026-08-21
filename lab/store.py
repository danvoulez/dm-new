"""Durable local development store for the canonical Lab ledger.

Production custody remains ``public.logline_acts``; this SQLite store mirrors the
shape closely enough for deterministic local runtime tests and development. Schema v4
admits historical receipt v0 and canonical receipt v1. ``tuple_hash`` is row identity;
``content_hash`` is indexed semantic identity and may repeat across envelopes.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .errors import NotFound
from .receipt import canonical_json, mint, verify_or_raise

SCHEMA_VERSION = 4

TABLE_DDL = """
CREATE TABLE IF NOT EXISTS logline_acts (
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  tuple_hash TEXT PRIMARY KEY CHECK(length(tuple_hash) = 64 AND tuple_hash NOT GLOB '*[^0-9a-f]*'),
  receipt_version TEXT NOT NULL,
  act TEXT NOT NULL,
  inserted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  envelope_hash TEXT,
  sent_by TEXT,
  sent_to TEXT,
  sent_at TEXT,
  channel TEXT,
  who TEXT GENERATED ALWAYS AS (json_extract(act,'$.who')) STORED,
  did TEXT GENERATED ALWAYS AS (json_extract(act,'$.did')) STORED,
  this TEXT GENERATED ALWAYS AS (json_extract(act,'$.this')) STORED,
  when_slot TEXT GENERATED ALWAYS AS (json_extract(act,'$.when')) STORED,
  confirmed_by TEXT GENERATED ALWAYS AS (json_extract(act,'$.confirmed_by')) STORED,
  if_ok TEXT GENERATED ALWAYS AS (json_extract(act,'$.if_ok')) STORED,
  if_doubt TEXT GENERATED ALWAYS AS (json_extract(act,'$.if_doubt')) STORED,
  if_not TEXT GENERATED ALWAYS AS (json_extract(act,'$.if_not')) STORED,
  status TEXT GENERATED ALWAYS AS (json_extract(act,'$.status')) STORED,
  aux TEXT GENERATED ALWAYS AS (
    json_remove(
      act,
      '$.id', '$.receipt_version', '$.json_canonicalization', '$.hashes', '$.envelope',
      '$.who', '$.did', '$.this', '$.when', '$.confirmed_by', '$.if_ok', '$.if_doubt', '$.if_not', '$.status'
    )
  ) STORED,
  CHECK (json_extract(act,'$.id') = content_hash),
  CHECK (json_extract(act,'$.hashes.tuple_hash') = tuple_hash),
  CHECK (json_extract(act,'$.receipt_version') = receipt_version),
  CHECK (receipt_version IN ('logline.receipt.v0','logline.receipt.v1')),
  CHECK (
    receipt_version != 'logline.receipt.v1'
    OR (
      json_type(act,'$.envelope') = 'object'
      AND json_extract(act,'$.hashes.envelope_hash') = envelope_hash
    )
  ),
  CHECK (json_type(act,'$.transport') IS NULL),
  CHECK (json_type(act,'$.result') IS NULL),
  CHECK (json_type(act,'$.evidence') IS NULL)
);
"""

INDEX_TRIGGER_DDL = """
CREATE INDEX IF NOT EXISTS logline_acts_content_hash_idx ON logline_acts(content_hash);
CREATE INDEX IF NOT EXISTS logline_acts_if_ok_idx ON logline_acts(if_ok);
CREATE INDEX IF NOT EXISTS logline_acts_status_idx ON logline_acts(status);
CREATE INDEX IF NOT EXISTS logline_acts_inserted_idx ON logline_acts(inserted_at);
CREATE INDEX IF NOT EXISTS logline_acts_who_idx ON logline_acts(who);
CREATE INDEX IF NOT EXISTS logline_acts_did_idx ON logline_acts(did);
CREATE INDEX IF NOT EXISTS logline_acts_this_idx ON logline_acts(this);
CREATE INDEX IF NOT EXISTS logline_acts_when_idx ON logline_acts(when_slot);
CREATE TRIGGER IF NOT EXISTS logline_acts_append_only_update
BEFORE UPDATE ON logline_acts
BEGIN
  SELECT RAISE(ABORT, 'logline_acts is append-only');
END;
CREATE TRIGGER IF NOT EXISTS logline_acts_append_only_delete
BEFORE DELETE ON logline_acts
BEGIN
  SELECT RAISE(ABORT, 'logline_acts is append-only');
END;
"""

DDL = f"""
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
{TABLE_DDL}
{INDEX_TRIGGER_DDL}
INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','{SCHEMA_VERSION}');
"""


def _needs_v4_rebuild(db: sqlite3.Connection) -> bool:
    row = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='logline_acts'").fetchone()
    if not row:
        return False
    sql = str(row[0] or "")
    return (
        "receipt_version = 'logline.receipt.v0'" in sql
        or "content_hash TEXT PRIMARY KEY" in sql
    )


def _migrate_v3_to_v4(db: sqlite3.Connection) -> None:
    """Rebuild the append-only table without rewriting any historical receipt bytes."""
    if not _needs_v4_rebuild(db):
        return
    db.executescript("""
      DROP TRIGGER IF EXISTS logline_acts_append_only_update;
      DROP TRIGGER IF EXISTS logline_acts_append_only_delete;
      DROP INDEX IF EXISTS logline_acts_content_hash_idx;
      DROP INDEX IF EXISTS logline_acts_if_ok_idx;
      DROP INDEX IF EXISTS logline_acts_status_idx;
      DROP INDEX IF EXISTS logline_acts_inserted_idx;
      DROP INDEX IF EXISTS logline_acts_who_idx;
      DROP INDEX IF EXISTS logline_acts_did_idx;
      DROP INDEX IF EXISTS logline_acts_this_idx;
      DROP INDEX IF EXISTS logline_acts_when_idx;
      ALTER TABLE logline_acts RENAME TO logline_acts_v0_backup;
    """)
    db.executescript(TABLE_DDL)
    db.execute(
        """INSERT INTO logline_acts(
             content_hash,tuple_hash,receipt_version,act,inserted_at,envelope_hash,sent_by,sent_to,sent_at,channel
           )
           SELECT content_hash,tuple_hash,receipt_version,act,inserted_at,envelope_hash,sent_by,sent_to,sent_at,channel
           FROM logline_acts_v0_backup"""
    )
    db.execute("DROP TABLE logline_acts_v0_backup")
    db.executescript(INDEX_TRIGGER_DDL)
    db.execute(
        "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version',?)",
        (str(SCHEMA_VERSION),),
    )
    db.commit()


def connect(path: str | Path) -> sqlite3.Connection:
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    _migrate_v3_to_v4(db)
    db.executescript(DDL)
    return db


@contextmanager
def transaction(db: sqlite3.Connection):
    try:
        db.execute("BEGIN")
        yield
    except Exception:
        db.rollback()
        raise
    else:
        db.commit()


def _envelope_hash(receipt: Mapping[str, Any]) -> str | None:
    hashes = receipt.get("hashes")
    if not isinstance(hashes, Mapping):
        return None
    value = hashes.get("envelope_hash")
    return str(value) if isinstance(value, str) else None


def append(db: sqlite3.Connection, fields: Mapping[str, Any], *, commit: bool = True) -> dict[str, Any]:
    receipt = mint(fields)
    act = canonical_json(receipt)
    db.execute(
        """INSERT OR IGNORE INTO logline_acts(content_hash, tuple_hash, receipt_version, act, envelope_hash)
           VALUES(?, ?, ?, ?, ?)""",
        (receipt["id"], receipt["hashes"]["tuple_hash"], receipt["receipt_version"], act, _envelope_hash(receipt)),
    )
    if commit:
        db.commit()
    return receipt


def append_receipt(db: sqlite3.Connection, receipt: Mapping[str, Any], *, commit: bool = True) -> dict[str, Any]:
    verify_or_raise(receipt)
    normalized = dict(receipt)
    act = canonical_json(normalized)
    db.execute(
        """INSERT OR IGNORE INTO logline_acts(content_hash, tuple_hash, receipt_version, act, envelope_hash)
           VALUES(?, ?, ?, ?, ?)""",
        (normalized["id"], normalized["hashes"]["tuple_hash"], normalized["receipt_version"], act, _envelope_hash(normalized)),
    )
    if commit:
        db.commit()
    return normalized


def get(db: sqlite3.Connection, content_hash: str) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT act FROM logline_acts WHERE content_hash = ? ORDER BY inserted_at, tuple_hash LIMIT 1",
        (content_hash,),
    ).fetchone()
    return json.loads(row["act"]) if row else None


def get_tuple(db: sqlite3.Connection, tuple_hash: str) -> dict[str, Any] | None:
    row = db.execute("SELECT act FROM logline_acts WHERE tuple_hash = ?", (tuple_hash,)).fetchone()
    return json.loads(row["act"]) if row else None


def require(db: sqlite3.Connection, content_hash: str) -> dict[str, Any]:
    receipt = get(db, content_hash)
    if receipt is None:
        raise NotFound(f"receipt not found: {content_hash}")
    return receipt


def list_acts(db: sqlite3.Connection, limit: int = 20, *, if_ok: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if if_ok is not None:
        clauses.append("if_ok = ?")
        params.append(if_ok)
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    rows = db.execute(f"SELECT act FROM logline_acts {where} ORDER BY inserted_at DESC, tuple_hash DESC LIMIT ?", params).fetchall()
    return [json.loads(row["act"]) for row in rows]


def count(db: sqlite3.Connection) -> int:
    return int(db.execute("SELECT count(*) AS n FROM logline_acts").fetchone()["n"])
