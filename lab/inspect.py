"""Portal read-only hash inspection.

Given a hash, return everything a reader is entitled to know about the receipt — its
metadata, its canonical nine slots, its validation status, and *safe* source refs (the
hashes it points at) — and **nothing that mutates state**. This surface is the read side
of the portal: no ``register``, no ``dispatch``, no ``close``, no ``append``. It opens the
database read-only and only ever issues ``SELECT``s.

Receipt v1 separates semantic identity (``content_hash``) from exact contextual occurrence
(``tuple_hash``). Inspection therefore resolves provenance in the identity domain asserted
by the citation: a content citation is looked up by content hash, while a tuple citation is
looked up by tuple hash. A content-hash inspection with multiple contextual occurrences is
made deterministic by returning the earliest ledger occurrence and exposing its tuple hash.
"""
from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .citation import validate_bundle_citation, validate_citation
from .errors import NotFound, ReceiptError
from .receipt import SLOTS, verify

HEX64 = re.compile(r"^[0-9a-f]{64}$")
_AUX_REF_FIELDS = ("process_contract_hash", "result_hash", "source_hash", "grant_id")


def _readonly_connect(path: str | Path) -> sqlite3.Connection:
    uri = f"file:{Path(path)}?mode=ro"
    db = sqlite3.connect(uri, uri=True)
    db.row_factory = sqlite3.Row
    return db


def _looks_like_hash(value: Any) -> bool:
    return isinstance(value, str) and bool(HEX64.match(value))


def _safe_source_refs(receipt: Mapping[str, Any], resolver) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(origin: str, value: Any, kind: str | None = None) -> None:
        if not _looks_like_hash(value):
            return
        key = (origin, value)
        if key in seen:
            return
        seen.add(key)
        entry: dict[str, Any] = {
            "origin": origin,
            "hash": value,
            "resolves": bool(resolver(value, kind)),
        }
        if kind is not None:
            entry["kind"] = kind
        refs.append(entry)

    add("this", receipt.get("this"))
    for field in _AUX_REF_FIELDS:
        add(field, receipt.get(field))
    for parent in receipt.get("parent_projection_hashes", []) or []:
        add("parent_projection_hashes", parent)
    citation = receipt.get("citation")
    if isinstance(citation, Mapping):
        if citation.get("kind") == "bundle":
            for leaf in citation.get("leaves", []) or []:
                if isinstance(leaf, Mapping):
                    add("citation.bundle", leaf.get("hash"), kind=leaf.get("kind"))
        else:
            add("citation", citation.get("cited_hash"), kind=citation.get("kind"))
    return refs


def _citation_status(receipt: Mapping[str, Any], resolver_get) -> dict[str, Any] | None:
    citation = receipt.get("citation")
    if not isinstance(citation, Mapping):
        return None
    status: dict[str, Any] = {"present": True, "kind": citation.get("kind")}
    try:
        if citation.get("kind") == "bundle":
            leaves = citation.get("leaves", []) or []
            cited = [resolver_get(leaf.get("hash"), leaf.get("kind")) for leaf in leaves]
            if any(c is None for c in cited):
                status.update({"validated": None, "reason": "cited_receipt_not_in_ledger"})
                return status
            validate_bundle_citation(citation, cited)
        else:
            kind = citation.get("kind")
            cited = resolver_get(citation.get("cited_hash"), kind)
            if cited is None:
                status.update({"validated": None, "reason": "cited_receipt_not_in_ledger"})
                return status
            validate_citation(citation, cited)
    except ReceiptError as exc:
        status.update({"validated": False, "reason": str(exc)})
        return status
    status["validated"] = True
    return status


def inspect_hash(db: sqlite3.Connection, content_hash: str) -> dict[str, Any]:
    """Read-only inspection of semantic identity by content hash.

    When the same semantic content occurs in several envelopes, this returns the earliest
    occurrence deterministically. Use the surfaced tuple hash to address exact occurrence
    identity in process/custody paths.
    """
    if not _looks_like_hash(content_hash):
        raise ReceiptError(f"not a valid content hash: {content_hash!r}")
    row = db.execute(
        "SELECT content_hash, tuple_hash, receipt_version, act, inserted_at, "
        "envelope_hash, sent_by, sent_to, sent_at, channel "
        "FROM logline_acts WHERE content_hash = ? ORDER BY inserted_at, tuple_hash LIMIT 1",
        (content_hash,),
    ).fetchone()
    if row is None:
        raise NotFound(f"receipt not found: {content_hash}")
    receipt = json.loads(row["act"])

    def resolver(value: str, kind: Any = None) -> bool:
        column = "tuple_hash" if kind == "tuple_hash" else "content_hash"
        found = db.execute(
            f"SELECT 1 FROM logline_acts WHERE {column} = ? LIMIT 1", (value,)
        ).fetchone()
        return found is not None

    def resolver_get(value: Any, kind: Any = None) -> dict[str, Any] | None:
        if not _looks_like_hash(value):
            return None
        column = "tuple_hash" if kind == "tuple_hash" else "content_hash"
        found = db.execute(
            f"SELECT act FROM logline_acts WHERE {column} = ? ORDER BY inserted_at, tuple_hash LIMIT 1",
            (value,),
        ).fetchone()
        return json.loads(found["act"]) if found else None

    ok, message = verify(receipt)
    transport = {
        key: row[key]
        for key in ("envelope_hash", "sent_by", "sent_to", "sent_at", "channel")
        if row[key] is not None
    }
    inspection = {
        "found": True,
        "read_only": True,
        "content_hash": row["content_hash"],
        "metadata": {
            "id": receipt.get("id"),
            "tuple_hash": row["tuple_hash"],
            "content_hash": row["content_hash"],
            "receipt_version": row["receipt_version"],
            "json_canonicalization": receipt.get("json_canonicalization"),
            "algorithm": receipt.get("hashes", {}).get("algorithm"),
            "inserted_at": row["inserted_at"],
            "ledger_transport": transport,
        },
        "slots": {slot: receipt.get(slot, "") for slot in SLOTS},
        "validation": {"ok": ok, "message": message},
        "citation": _citation_status(receipt, resolver_get),
        "source_refs": _safe_source_refs(receipt, resolver),
        "receipt": receipt,
    }
    result = dict(receipt)
    result.update(inspection)
    return result


def inspect_hash_at(path: str | Path, content_hash: str) -> dict[str, Any]:
    if not Path(path).exists():
        raise NotFound(f"ledger not found: {path}")
    db = _readonly_connect(path)
    try:
        return inspect_hash(db, content_hash)
    finally:
        db.close()
