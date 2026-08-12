"""Canonical LogLine receipt v0 minting and verification.

This module has zero runtime pip dependencies but is strict: it rejects forbidden
transport/result/evidence fields, requires the nine stable slots to be strings,
hashes over true RFC 8785 (JCS) canonical bytes via the vendored reference
canonicalizer (see ``lab/_vendor/README.md``), and stores `id` as the content hash.
"""
from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Any

from ._vendor import rfc8785
from .errors import ReceiptError

SLOTS = ("who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status")
SYSTEM_FIELDS = {"id", "receipt_version", "json_canonicalization", "hashes"}
FORBIDDEN = {"result", "evidence", "transport"}
# The hashes object is closed (LIP-0007 additionalProperties:false): exactly these
# three keys, no more. envelope_hash in particular lives on the Envelope wrapper, never
# inside a receipt's hashes — admitting it here would let transport metadata masquerade
# as receipt identity. The authority side must enforce this, not just the JSON schema.
HASH_FIELDS = {"tuple_hash", "content_hash", "algorithm"}
RECEIPT_VERSION = "logline.receipt.v0"
CANONICALIZATION = "jcs-rfc8785"
HASH_ALGORITHM = "sha256"


def canonical_json(value: Any) -> str:
    """Return RFC 8785 (JCS) canonical JSON for receipt hash material.

    Delegates to the vendored Trail of Bits reference implementation (see
    ``lab/_vendor/README.md``) so the ``jcs-rfc8785`` label is literal, not
    aspirational: ECMAScript number serialization, UTF-16 key ordering, and the
    I-JSON integer domain (±(2**53-1)). Determinism here is load-bearing — the
    content hash is the Act's identity, and the Python side must agree byte-for-byte
    with the Rust gate. RFC 8785 output is valid UTF-8 by construction, so decoding
    is lossless and ``sha256_text`` re-encodes to the identical bytes.
    """
    try:
        return rfc8785.dumps(value).decode("utf-8")
    except rfc8785.CanonicalizationError as exc:
        raise ReceiptError(f"value is not canonicalizable under RFC 8785: {exc}") from exc


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _validate_input_fields(fields: Mapping[str, Any]) -> None:
    forbidden = FORBIDDEN.intersection(fields)
    if forbidden:
        raise ReceiptError(f"forbidden top-level field(s): {', '.join(sorted(forbidden))}")
    for slot in SLOTS:
        if slot in fields and not isinstance(fields[slot], str):
            raise ReceiptError(f"receipt slot {slot!r} must be a string")


def mint(fields: Mapping[str, Any]) -> dict[str, Any]:
    """Mint a canonical receipt from slot values plus AUX fields."""
    _validate_input_fields(fields)
    receipt: dict[str, Any] = {slot: fields.get(slot, "") for slot in SLOTS}
    receipt["receipt_version"] = RECEIPT_VERSION
    receipt["json_canonicalization"] = CANONICALIZATION

    for key, value in fields.items():
        if key not in SLOTS and key not in SYSTEM_FIELDS and key not in FORBIDDEN:
            receipt[key] = value

    tuple_material = {slot: receipt[slot] for slot in SLOTS}
    content_material = {key: value for key, value in receipt.items() if key not in {"id", "hashes"}}
    tuple_hash = sha256_text(canonical_json(tuple_material))
    content_hash = sha256_text(canonical_json(content_material))
    receipt["hashes"] = {"tuple_hash": tuple_hash, "content_hash": content_hash, "algorithm": HASH_ALGORITHM}
    receipt["id"] = content_hash
    return receipt


def verify(receipt: Mapping[str, Any]) -> tuple[bool, str]:
    """Verify a receipt without throwing; returns `(ok, message)`."""
    try:
        verify_or_raise(receipt)
    except ReceiptError as exc:
        return False, str(exc)
    return True, "ok"


def verify_or_raise(receipt: Mapping[str, Any]) -> None:
    missing = [field for field in (*SLOTS, "receipt_version", "json_canonicalization", "hashes", "id") if field not in receipt]
    if missing:
        raise ReceiptError(f"missing required field(s): {', '.join(missing)}")
    _validate_input_fields(receipt)
    if receipt["receipt_version"] != RECEIPT_VERSION:
        raise ReceiptError("unsupported receipt_version")
    if receipt["json_canonicalization"] != CANONICALIZATION:
        raise ReceiptError("unsupported json_canonicalization")
    hashes = receipt["hashes"]
    if not isinstance(hashes, Mapping) or hashes.get("algorithm") != HASH_ALGORITHM:
        raise ReceiptError("hashes.algorithm must be sha256")
    extra_hash_fields = set(hashes) - HASH_FIELDS
    if extra_hash_fields:
        raise ReceiptError(f"hashes object has forbidden field(s): {', '.join(sorted(extra_hash_fields))}")
    expected = mint({key: value for key, value in receipt.items() if key not in {"id", "hashes"}})
    if receipt["id"] != expected["id"]:
        raise ReceiptError("id/content_hash mismatch")
    if hashes.get("tuple_hash") != expected["hashes"]["tuple_hash"]:
        raise ReceiptError("tuple_hash mismatch")
    if hashes.get("content_hash") != expected["hashes"]["content_hash"]:
        raise ReceiptError("content_hash mismatch")
