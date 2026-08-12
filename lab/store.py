"""Durable local development store for the canonical Lab ledger.

Production custody remains `public.logline_acts`; this SQLite store mirrors the
shape closely enough for deterministic local runtime tests and development.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable, Mapping
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .errors import NotFound
from .receipt import canonical_json, mint, verify_or_raise

SCHEMA_VERSION = 3

DDL = f"""
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS logline_acts (
  content_hash TEXT PRIMARY KEY CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  tuple_hash TEXT NOT NULL CHECK(length(tuple_hash) = 64 AND tuple_hash NOT GLOB '*[^0-9a-f]*'),
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
      '$.id',
      '$.receipt_version',
      '$.json_canonicalization',
      '$.hashes',
      '$.who',
      '$.did',
      '$.this',
      '$.when',
      '$.confirmed_by',
      '$.if_ok',
      '$.if_doubt',
      '$.if_not',
      '$.status'
    )
  ) STORED,
  CHECK (json_extract(act,'$.id') = content_hash),
  CHECK (json_extract(act,'$.hashes.tuple_hash') = tuple_hash),
  CHECK (json_extract(act,'$.receipt_version') = receipt_version),
  CHECK (receipt_version = 'logline.receipt.v0'),
  CHECK (json_type(act,'$.transport') IS NULL),
  CHECK (json_type(act,'$.result') IS NULL),
  CHECK (json_type(act,'$.evidence') IS NULL)
);
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
INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','{SCHEMA_VERSION}');
"""


def connect(path: str | Path) -> sqlite3.Connection:
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
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


def append(db: sqlite3.Connection, fields: Mapping[str, Any], *, commit: bool = True) -> dict[str, Any]:
    receipt = mint(fields)
    act = canonical_json(receipt)
    db.execute(
        "INSERT OR IGNORE INTO logline_acts(content_hash, tuple_hash, receipt_version, act) VALUES(?, ?, ?, ?)",
        (receipt["id"], receipt["hashes"]["tuple_hash"], receipt["receipt_version"], act),
    )
    if commit:
        db.commit()
    return receipt


def append_receipt(db: sqlite3.Connection, receipt: Mapping[str, Any], *, commit: bool = True) -> dict[str, Any]:
    verify_or_raise(receipt)
    normalized = dict(receipt)
    act = canonical_json(normalized)
    db.execute(
        "INSERT OR IGNORE INTO logline_acts(content_hash, tuple_hash, receipt_version, act) VALUES(?, ?, ?, ?)",
        (normalized["id"], normalized["hashes"]["tuple_hash"], normalized["receipt_version"], act),
    )
    if commit:
        db.commit()
    return normalized


def get(db: sqlite3.Connection, content_hash: str) -> dict[str, Any] | None:
    row = db.execute("SELECT act FROM logline_acts WHERE content_hash = ?", (content_hash,)).fetchone()
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
    rows = db.execute(f"SELECT act FROM logline_acts {where} ORDER BY inserted_at DESC LIMIT ?", params).fetchall()
    return [json.loads(row["act"]) for row in rows]


def count(db: sqlite3.Connection) -> int:
    return int(db.execute("SELECT count(*) AS n FROM logline_acts").fetchone()["n"])
