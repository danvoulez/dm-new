"""Portal read-only hash inspection.

Given a hash, return everything a reader is entitled to know about the receipt — its
metadata, its canonical nine slots, its validation status, and *safe* source refs (the
hashes it points at) — and **nothing that mutates state**. This surface is the read side
of the portal: no ``register``, no ``dispatch``, no ``close``, no ``append``. It opens the
database read-only and only ever issues ``SELECT``s.

Why a dedicated surface instead of just ``store.get``: ``get`` returns the raw act;
inspection answers the portal's actual question — "is this Act real, valid, and what does
it reference?" — without handing the caller a writable connection or any verb that could
advance the ledger. The two are deliberately separate so a read-only consumer (a viewer, an
auditor, an LLM proposing over history) is *structurally* unable to write.

A "safe source ref" is a hash this receipt cites or descends from, surfaced so a reader can
walk provenance — never a capability. We surface the citation (if present, validated), the
AUX provenance hashes the receipt carries (``this`` when it is a hash, ``process_contract_hash``,
``result_hash``, ``parent_*`` hashes), and — when the source ref is itself present in the
ledger — a note that it resolves. We never *follow* a ref into a mutation.
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

# AUX fields whose values are content hashes of *other* receipts: provenance edges a reader
# may safely walk. Kept explicit so an arbitrary AUX string is never mistaken for a ref.
_AUX_REF_FIELDS = ("process_contract_hash", "result_hash", "source_hash", "grant_id")


def _readonly_connect(path: str | Path) -> sqlite3.Connection:
    """Open the ledger in SQLite read-only (immutable-by-URI) mode.

    The connection physically cannot write: even a smuggled INSERT/UPDATE/DELETE raises
    ``sqlite3.OperationalError`` ("attempt to write a readonly database"). This is the
    structural guarantee behind "no mutation", not a convention.
    """
    uri = f"file:{Path(path)}?mode=ro"
    db = sqlite3.connect(uri, uri=True)
    db.row_factory = sqlite3.Row
    return db


def _looks_like_hash(value: Any) -> bool:
    return isinstance(value, str) and bool(HEX64.match(value))


def _safe_source_refs(receipt: Mapping[str, Any], resolver) -> list[dict[str, Any]]:
    """Collect citable/provenance hashes the receipt points at, each marked resolved-or-not.

    ``resolver(hash) -> bool`` answers "is this hash present in the ledger?" without
    returning anything writable. Refs are de-duplicated and reported with their origin so a
    reader knows *why* the edge exists (a citation vs. an AUX provenance field vs. the
    ``this`` slot pointing at a target Act).
    """
    refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(origin: str, value: Any, kind: str | None = None) -> None:
        if not _looks_like_hash(value):
            return
        key = (origin, value)
        if key in seen:
            return
        seen.add(key)
        entry: dict[str, Any] = {"origin": origin, "hash": value, "resolves": bool(resolver(value))}
        if kind is not None:
            entry["kind"] = kind
        refs.append(entry)

    # The `this` slot frequently carries the hash of the target/source Act (wake_handled,
    # result acts, citations). Surface it only when it actually looks like a hash.
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
    """Validate an embedded citation against the cited receipt(s) if they are in the ledger.

    ``resolver_get(hash) -> dict | None`` returns the cited receipt (read-only) or None.
    Returns a status dict (``present``/``validated``/``reason``) or None when the receipt
    carries no citation. Never mutates; a missing cited receipt is reported, not fetched-and-
    written.
    """
    citation = receipt.get("citation")
    if not isinstance(citation, Mapping):
        return None
    status: dict[str, Any] = {"present": True, "kind": citation.get("kind")}
    try:
        if citation.get("kind") == "bundle":
            leaves = citation.get("leaves", []) or []
            cited = [resolver_get(leaf.get("hash")) for leaf in leaves]
            if any(c is None for c in cited):
                status.update({"validated": None, "reason": "cited_receipt_not_in_ledger"})
                return status
            validate_bundle_citation(citation, cited)
        else:
            cited = resolver_get(citation.get("cited_hash"))
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
    """Read-only inspection of a receipt by its content hash.

    Returns metadata, canonical slots, validation status, and safe source refs. The passed
    connection is used only for ``SELECT``. Raises ``NotFound`` if the hash is unknown.
    Use ``inspect_hash_at`` for a path-based, structurally read-only connection.
    """
    if not _looks_like_hash(content_hash):
        raise ReceiptError(f"not a valid content hash: {content_hash!r}")
    row = db.execute(
        "SELECT content_hash, tuple_hash, receipt_version, act, inserted_at, "
        "envelope_hash, sent_by, sent_to, sent_at, channel "
        "FROM logline_acts WHERE content_hash = ?",
        (content_hash,),
    ).fetchone()
    if row is None:
        raise NotFound(f"receipt not found: {content_hash}")
    receipt = json.loads(row["act"])

    def resolver(value: str) -> bool:
        found = db.execute(
            "SELECT 1 FROM logline_acts WHERE content_hash = ? LIMIT 1", (value,)
        ).fetchone()
        return found is not None

    def resolver_get(value: Any) -> dict[str, Any] | None:
        if not _looks_like_hash(value):
            return None
        found = db.execute(
            "SELECT act FROM logline_acts WHERE content_hash = ? LIMIT 1", (value,)
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
    # Human/CLI ergonomics: inspection is a strict superset of the receipt, so callers
    # can read ``did``/``status``/AUX directly while retaining the structural read-only
    # metadata.  Inspection-owned keys win on collision; the untouched receipt remains
    # available under ``receipt``.
    result = dict(receipt)
    result.update(inspection)
    return result


def inspect_hash_at(path: str | Path, content_hash: str) -> dict[str, Any]:
    """Path-based read-only inspection over a SQLite read-only connection.

    Opens the ledger in ``mode=ro`` so the surface cannot mutate even by mistake, runs the
    inspection, and closes the connection.
    """
    if not Path(path).exists():
        raise NotFound(f"ledger not found: {path}")
    db = _readonly_connect(path)
    try:
        return inspect_hash(db, content_hash)
    finally:
        db.close()
