"""Rebuildable, non-authoritative Lab projections.

The authoritative source remains ``logline_acts``. This module stores local
projection documents only as disposable read models that can be recreated from
the ledger.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping, Sequence
from typing import Any

from .errors import LabError, NotFound
from .receipt import canonical_json, sha256_text
from .runtime import now

PROJECTION_DDL = """
CREATE TABLE IF NOT EXISTS projection_docs (
  projection_hash TEXT PRIMARY KEY,
  projection_spec TEXT NOT NULL,
  class TEXT NOT NULL CHECK(class IN ('stable','dynamic')),
  doc TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE(projection_spec, class, doc)
);
CREATE INDEX IF NOT EXISTS projection_docs_spec_idx ON projection_docs(projection_spec);
"""


def ensure_projections(db: sqlite3.Connection) -> None:
    db.executescript(PROJECTION_DDL)
    db.commit()


def _ledger_snapshot(db: sqlite3.Connection) -> tuple[list[str], dict[str, Any]]:
    rows = db.execute(
        """SELECT content_hash, did, status, if_ok
           FROM logline_acts
           ORDER BY inserted_at, content_hash"""
    ).fetchall()
    input_hashes = [row["content_hash"] for row in rows]
    by_status: dict[str, int] = {}
    by_did: dict[str, int] = {}
    by_if_ok: dict[str, int] = {}
    for row in rows:
        by_status[row["status"] or ""] = by_status.get(row["status"] or "", 0) + 1
        by_did[row["did"] or ""] = by_did.get(row["did"] or "", 0) + 1
        by_if_ok[row["if_ok"] or ""] = by_if_ok.get(row["if_ok"] or "", 0) + 1
    return input_hashes, {
        "counts": {
            "acts": len(rows),
            "by_status": dict(sorted(by_status.items())),
            "by_did": dict(sorted(by_did.items())),
            "by_if_ok": dict(sorted(by_if_ok.items())),
        }
    }


def _projection_spec_hash(projection_spec: str) -> str:
    return sha256_text(canonical_json({"projection_spec": projection_spec}))


def _validate_dynamic(
    projection_class: str,
    pin: Mapping[str, Any] | None,
    ladder_level: str,
) -> dict[str, Any] | None:
    if projection_class != "dynamic":
        return None
    if not pin:
        raise LabError("dynamic projections require pin metadata")
    required = {"model", "prompt", "params", "seed"}
    missing = sorted(required.difference(pin))
    if missing:
        raise LabError(f"dynamic projection pin missing: {', '.join(missing)}")
    if ladder_level not in {"L0", "L1", "L2", "L3", "L4", "L5"}:
        raise LabError("dynamic projection ladder_level must be L0-L5")
    return dict(pin)


def compute_projection(
    db: sqlite3.Connection,
    projection_spec: str = "lab_current_state",
    *,
    projection_class: str = "stable",
    pin: Mapping[str, Any] | None = None,
    parent_projection_hashes: Sequence[str] = (),
    ladder_level: str = "L0",
) -> dict[str, Any]:
    """Compute a projection document from ledger authority without persisting it.

    This split is load-bearing for adapter semantics: an adapter may request or compute
    a non-authoritative read model, but only the governed executor/CLI path persists it.
    """
    if projection_class not in {"stable", "dynamic"}:
        raise LabError("projection class must be stable or dynamic")
    normalized_pin = _validate_dynamic(projection_class, pin, ladder_level)
    input_hashes, snapshot = _ledger_snapshot(db)
    doc: dict[str, Any] = {
        "projection_spec": projection_spec,
        "projection_spec_hash": _projection_spec_hash(projection_spec),
        "projection_version": "projection.local.v0",
        "class": projection_class,
        "authoritative": False,
        "rebuildable": True,
        "sources": ["logline_acts"],
        "input_hashes": input_hashes,
        "parent_projection_hashes": list(parent_projection_hashes),
        "ladder_level": ladder_level,
        **snapshot,
    }
    if normalized_pin is not None:
        doc["pin"] = normalized_pin
    hash_material = {key: value for key, value in doc.items() if key != "computed_at"}
    doc["projection_hash"] = sha256_text(canonical_json(hash_material))
    doc["computed_at"] = now()
    return doc


def store_projection(db: sqlite3.Connection, doc: Mapping[str, Any]) -> dict[str, Any]:
    """Persist an already-computed non-authoritative projection document."""
    ensure_projections(db)
    normalized = dict(doc)
    if normalized.get("authoritative") is not False or normalized.get("rebuildable") is not True:
        raise LabError("projection persistence refused: projections must be non-authoritative and rebuildable")
    projection_hash = normalized.get("projection_hash")
    projection_spec = normalized.get("projection_spec")
    projection_class = normalized.get("class")
    if not all(isinstance(value, str) and value for value in (projection_hash, projection_spec, projection_class)):
        raise LabError("projection persistence refused: missing projection identity")
    stored_doc = canonical_json(normalized)
    db.execute(
        """INSERT INTO projection_docs(projection_hash, projection_spec, class, doc, computed_at)
           VALUES(?, ?, ?, ?, ?)
           ON CONFLICT(projection_hash) DO UPDATE SET doc = excluded.doc, computed_at = excluded.computed_at""",
        (projection_hash, projection_spec, projection_class, stored_doc, normalized.get("computed_at", now())),
    )
    db.commit()
    return normalized


def project_build(
    db: sqlite3.Connection,
    projection_spec: str = "lab_current_state",
    *,
    projection_class: str = "stable",
    pin: Mapping[str, Any] | None = None,
    parent_projection_hashes: Sequence[str] = (),
    ladder_level: str = "L0",
) -> dict[str, Any]:
    return store_projection(
        db,
        compute_projection(
            db,
            projection_spec,
            projection_class=projection_class,
            pin=pin,
            parent_projection_hashes=parent_projection_hashes,
            ladder_level=ladder_level,
        ),
    )


def project_all(db: sqlite3.Connection) -> dict[str, Any]:
    built = [project_build(db, "lab_current_state")]
    return {"projection": "all", "built": built, "authoritative": False, "rebuildable": True}


def project_inspect(db: sqlite3.Connection, projection_hash: str) -> dict[str, Any]:
    ensure_projections(db)
    row = db.execute("SELECT doc FROM projection_docs WHERE projection_hash = ?", (projection_hash,)).fetchone()
    if row is None:
        raise NotFound(f"projection not found: {projection_hash}")
    return json.loads(row["doc"])


def project_descend(db: sqlite3.Connection, projection_hash: str) -> dict[str, Any]:
    parent = project_inspect(db, projection_hash)
    rows = db.execute("SELECT doc FROM projection_docs ORDER BY computed_at, projection_hash").fetchall()
    children = []
    for row in rows:
        doc = json.loads(row["doc"])
        if projection_hash in doc.get("parent_projection_hashes", []):
            children.append(doc)
    return {"projection_hash": projection_hash, "parent": parent, "children": children}


def project_verify(db: sqlite3.Connection) -> dict[str, Any]:
    ensure_projections(db)
    rows = db.execute("SELECT projection_hash, doc FROM projection_docs ORDER BY projection_hash").fetchall()
    failures: list[str] = []
    for row in rows:
        doc = json.loads(row["doc"])
        if doc.get("projection_hash") != row["projection_hash"]:
            failures.append(f"{row['projection_hash']}: projection_hash mismatch")
        if doc.get("authoritative") is not False:
            failures.append(f"{row['projection_hash']}: authoritative must be false")
        if doc.get("rebuildable") is not True:
            failures.append(f"{row['projection_hash']}: rebuildable must be true")
        if not isinstance(doc.get("input_hashes"), list):
            failures.append(f"{row['projection_hash']}: input_hashes missing")
        if doc.get("class") == "dynamic" and "pin" not in doc:
            failures.append(f"{row['projection_hash']}: dynamic projection missing pin")
    return {"ok": not failures, "count": len(rows), "failures": failures, "authoritative": False, "rebuildable": True}
