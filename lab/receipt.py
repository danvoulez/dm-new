"""Canonical LogLine receipt minting and verification.

v1 implements the product v1.2 identity split:

    content_hash  = H(JCS(LogLine 9 fields + AUX))
    envelope_hash = H(JCS(envelope))
    tuple_hash    = H(content_hash + envelope_hash)

Receipt metadata is not content identity. The envelope is persisted in the universal
unit so process/custody context can be replayed. Historical ``logline.receipt.v0``
verification remains supported byte-for-byte; new ``mint`` calls produce v1.
"""
from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Any

from ._vendor import rfc8785
from .errors import ReceiptError

SLOTS = ("who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status")
SYSTEM_FIELDS = {"id", "receipt_version", "json_canonicalization", "hashes", "envelope"}
FORBIDDEN = {"result", "evidence", "transport"}
HASH_FIELDS_V0 = {"tuple_hash", "content_hash", "algorithm"}
HASH_FIELDS_V1 = {"tuple_hash", "content_hash", "envelope_hash", "algorithm"}
# Compatibility export used by historical hardening tests.
HASH_FIELDS = HASH_FIELDS_V1
RECEIPT_VERSION_V0 = "logline.receipt.v0"
RECEIPT_VERSION_V1 = "logline.receipt.v1"
RECEIPT_VERSION = RECEIPT_VERSION_V1
CANONICALIZATION = "jcs-rfc8785"
HASH_ALGORITHM = "sha256"


def canonical_json(value: Any) -> str:
    """Return RFC 8785 (JCS) canonical JSON for identity hash material."""
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
    if "envelope" in fields and not isinstance(fields["envelope"], Mapping):
        raise ReceiptError("envelope must be a JSON object")


def _content_material(fields: Mapping[str, Any]) -> dict[str, Any]:
    content: dict[str, Any] = {slot: fields.get(slot, "") for slot in SLOTS}
    for key, value in fields.items():
        if key not in SLOTS and key not in SYSTEM_FIELDS and key not in FORBIDDEN:
            content[key] = value
    return content


def mint(fields: Mapping[str, Any], *, envelope: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Mint the canonical v1 universal unit from LogLine+AUX plus envelope."""
    _validate_input_fields(fields)
    content = _content_material(fields)
    source_envelope = envelope if envelope is not None else fields.get("envelope", {})
    if not isinstance(source_envelope, Mapping):
        raise ReceiptError("envelope must be a JSON object")
    envelope_value = dict(source_envelope)

    content_hash = sha256_text(canonical_json(content))
    envelope_hash = sha256_text(canonical_json(envelope_value))
    tuple_hash = sha256_text(content_hash + envelope_hash)

    receipt: dict[str, Any] = {
        **content,
        "envelope": envelope_value,
        "receipt_version": RECEIPT_VERSION_V1,
        "json_canonicalization": CANONICALIZATION,
        "hashes": {
            "tuple_hash": tuple_hash,
            "content_hash": content_hash,
            "envelope_hash": envelope_hash,
            "algorithm": HASH_ALGORITHM,
        },
        "id": content_hash,
    }
    return receipt


def mint_v0(fields: Mapping[str, Any]) -> dict[str, Any]:
    """Mint historical receipt v0 exactly; retained for parity fixtures/migrations."""
    _validate_input_fields(fields)
    receipt: dict[str, Any] = {slot: fields.get(slot, "") for slot in SLOTS}
    receipt["receipt_version"] = RECEIPT_VERSION_V0
    receipt["json_canonicalization"] = CANONICALIZATION

    for key, value in fields.items():
        if key not in SLOTS and key not in SYSTEM_FIELDS and key not in FORBIDDEN:
            receipt[key] = value

    tuple_material = {slot: receipt[slot] for slot in SLOTS}
    legacy_content_material = {key: value for key, value in receipt.items() if key not in {"id", "hashes"}}
    tuple_hash = sha256_text(canonical_json(tuple_material))
    content_hash = sha256_text(canonical_json(legacy_content_material))
    receipt["hashes"] = {"tuple_hash": tuple_hash, "content_hash": content_hash, "algorithm": HASH_ALGORITHM}
    receipt["id"] = content_hash
    return receipt


def verify(receipt: Mapping[str, Any]) -> tuple[bool, str]:
    """Verify either supported receipt version without throwing."""
    try:
        verify_or_raise(receipt)
    except ReceiptError as exc:
        return False, str(exc)
    return True, "ok"


def _require_common(receipt: Mapping[str, Any]) -> Mapping[str, Any]:
    missing = [field for field in (*SLOTS, "receipt_version", "json_canonicalization", "hashes", "id") if field not in receipt]
    if missing:
        raise ReceiptError(f"missing required field(s): {', '.join(missing)}")
    _validate_input_fields(receipt)
    if receipt["json_canonicalization"] != CANONICALIZATION:
        raise ReceiptError("unsupported json_canonicalization")
    hashes = receipt["hashes"]
    if not isinstance(hashes, Mapping) or hashes.get("algorithm") != HASH_ALGORITHM:
        raise ReceiptError("hashes.algorithm must be sha256")
    return hashes


def _verify_v0(receipt: Mapping[str, Any], hashes: Mapping[str, Any]) -> None:
    extra_hash_fields = set(hashes) - HASH_FIELDS_V0
    if extra_hash_fields:
        raise ReceiptError(f"hashes object has forbidden field(s): {', '.join(sorted(extra_hash_fields))}")
    expected = mint_v0({key: value for key, value in receipt.items() if key not in {"id", "hashes"}})
    if receipt["id"] != expected["id"]:
        raise ReceiptError("id/content_hash mismatch")
    if hashes.get("tuple_hash") != expected["hashes"]["tuple_hash"]:
        raise ReceiptError("tuple_hash mismatch")
    if hashes.get("content_hash") != expected["hashes"]["content_hash"]:
        raise ReceiptError("content_hash mismatch")


def _verify_v1(receipt: Mapping[str, Any], hashes: Mapping[str, Any]) -> None:
    if "envelope" not in receipt or not isinstance(receipt["envelope"], Mapping):
        raise ReceiptError("receipt v1 requires envelope object")
    extra_hash_fields = set(hashes) - HASH_FIELDS_V1
    missing_hash_fields = HASH_FIELDS_V1 - set(hashes)
    if extra_hash_fields:
        raise ReceiptError(f"hashes object has forbidden field(s): {', '.join(sorted(extra_hash_fields))}")
    if missing_hash_fields:
        raise ReceiptError(f"hashes object missing field(s): {', '.join(sorted(missing_hash_fields))}")

    expected = mint({key: value for key, value in receipt.items() if key not in {"id", "hashes"}})
    if receipt["id"] != expected["id"]:
        raise ReceiptError("id/content_hash mismatch")
    for field in ("content_hash", "envelope_hash", "tuple_hash"):
        if hashes.get(field) != expected["hashes"][field]:
            raise ReceiptError(f"{field} mismatch")


def verify_or_raise(receipt: Mapping[str, Any]) -> None:
    hashes = _require_common(receipt)
    version = receipt["receipt_version"]
    if version == RECEIPT_VERSION_V0:
        _verify_v0(receipt, hashes)
        return
    if version == RECEIPT_VERSION_V1:
        _verify_v1(receipt, hashes)
        return
    raise ReceiptError("unsupported receipt_version")
