"""Authority registry — the structural root of trust (LAB FINAL SPEC v0 §13).

"Authority is registered structure." An authority is an append-only Act
(``did='authority'``) naming an identity that may sign grants. Authorities trace to a
self-attested genesis and are revocable by a later append-only Act
(``did='authority-revoke'``). This is the LAYER that makes authority auditable,
revocable, and traceable.

WHAT THIS IS NOT — read this before trusting it:
    This is the STRUCTURAL layer, not the CRYPTOGRAPHIC one. Anyone able to write the
    ledger (e.g. service_role) can still forge an authority Act, because a content
    hash proves integrity, not authorship. Real security ("an LLM cannot forge this")
    arrives only with the BINDING layer: a passkey/WebAuthn (FIDO2) assertion over the
    Act's content_hash, verified against an enrolled authenticator public key — the
    biometric gates a hardware key that never leaves its enclave. ``verify_signature``
    below is the seam where that binding attaches. Until it is wired, do not describe
    grants as cryptographically secure — only as structurally governed.
"""
from __future__ import annotations

import sqlite3
from typing import Any

from .errors import AuthorityError
from .store import append

AUTHORITY_DID = "authority"
AUTHORITY_REVOKE_DID = "authority-revoke"
AUTHENTICATOR_DID = "authenticator-enroll"
AUTHENTICATOR_REVOKE_DID = "authenticator-revoke"


def register_genesis_authority(db: sqlite3.Connection, identity: str, *, note: str = "") -> dict[str, Any]:
    """Seed the self-attested root authority. Intended once, at bootstrap.

    The genesis authority vouches for itself — the buck stops here. In a hardened
    deployment this bootstrap is the moment a real human enrolls their authenticator;
    structurally it is just the first authority Act whose registrar is itself.
    """
    if not str(identity or "").strip():
        raise AuthorityError("genesis authority identity must be non-empty")
    return append(
        db,
        {
            "who": identity,
            "did": AUTHORITY_DID,
            "this": identity,
            "when": _now(),
            "confirmed_by": identity,
            "if_ok": "authority-active.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "active",
            "registered_by": identity,
            "genesis": True,
            "note": note,
        },
    )


def register_authority(db: sqlite3.Connection, identity: str, *, registered_by: str, note: str = "") -> dict[str, Any]:
    """Register a new authority. The registrar must itself be a recognized authority.

    This keeps the authority set a chain that traces back to genesis rather than an
    open free-for-all. (The chain is only as trustworthy as the binding layer that
    proves the registrar actually authored this Act — see module docstring.)
    """
    if not str(identity or "").strip():
        raise AuthorityError("authority identity must be non-empty")
    ok, reason = authority_recognized(db, registered_by)
    if not ok:
        raise AuthorityError(f"registrar {registered_by!r} is not a recognized authority ({reason})")
    return append(
        db,
        {
            "who": registered_by,
            "did": AUTHORITY_DID,
            "this": identity,
            "when": _now(),
            "confirmed_by": registered_by,
            "if_ok": "authority-active.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "active",
            "registered_by": registered_by,
            "genesis": False,
            "note": note,
        },
    )


def revoke_authority(db: sqlite3.Connection, identity: str, *, revoked_by: str, reason: str = "revoked") -> dict[str, Any]:
    """Append a revocation citing the authority identity. Append-only, never a delete."""
    ok, why = authority_recognized(db, revoked_by)
    if not ok:
        raise AuthorityError(f"revoker {revoked_by!r} is not a recognized authority ({why})")
    return append(
        db,
        {
            "who": revoked_by,
            "did": AUTHORITY_REVOKE_DID,
            "this": identity,
            "when": _now(),
            "confirmed_by": revoked_by,
            "if_ok": "attention-raise.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "revoked",
            "reason": reason,
        },
    )


def is_authority(db: sqlite3.Connection, identity: str) -> bool:
    """True if ``identity`` has an active, non-revoked authority enrollment."""
    if not str(identity or "").strip():
        return False
    enrolled = db.execute(
        "SELECT 1 FROM logline_acts WHERE did = ? AND this = ? AND status = 'active' LIMIT 1",
        (AUTHORITY_DID, identity),
    ).fetchone()
    if enrolled is None:
        return False
    revoked = db.execute(
        "SELECT 1 FROM logline_acts WHERE did = ? AND this = ? LIMIT 1",
        (AUTHORITY_REVOKE_DID, identity),
    ).fetchone()
    return revoked is None


def authority_recognized(db: sqlite3.Connection, identity: str | None) -> tuple[bool, str]:
    """Root-of-trust check (structural layer). Returns ``(ok, reason)``.

    Hardened from the earlier provisional seam to a real registry lookup: an authority
    is recognized iff it has an active, non-revoked authority Act. The cryptographic
    binding (passkey/WebAuthn over content_hash) is still a separate, future layer.
    """
    if not str(identity or "").strip():
        return False, "missing_authority"
    if is_authority(db, identity):
        return True, "authority_registered"
    return False, "unregistered_authority"


def enroll_authenticator(
    db: sqlite3.Connection,
    identity: str,
    *,
    credential_id: str,
    public_key: str,
    rp_id: str,
    origin: str,
    registered_by: str,
    sign_count: int = 0,
    aaguid: str = "",
) -> dict[str, Any]:
    """Bind a passkey/WebAuthn authenticator (its COSE public key) to an authority.

    Storing a public key needs NO crypto, so enrollment lives in the zero-dep core;
    only *verifying assertions* needs the optional crypto boundary (lab/signing). The
    identity and the registrar must both be recognized authorities.
    """
    ok, reason = authority_recognized(db, registered_by)
    if not ok:
        raise AuthorityError(f"registrar {registered_by!r} is not a recognized authority ({reason})")
    ok, reason = authority_recognized(db, identity)
    if not ok:
        raise AuthorityError(f"cannot enroll an authenticator for non-authority {identity!r} ({reason})")
    return append(
        db,
        {
            "who": registered_by,
            "did": AUTHENTICATOR_DID,
            "this": identity,
            "when": _now(),
            "confirmed_by": registered_by,
            "if_ok": "authenticator-active.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "active",
            "credential_id": credential_id,
            "public_key": public_key,
            "rp_id": rp_id,
            "origin": origin,
            "sign_count": int(sign_count),
            "aaguid": aaguid,
        },
    )


def get_authenticator(db: sqlite3.Connection, identity: str) -> dict[str, Any] | None:
    """Return the latest active, non-revoked authenticator enrollment for an identity."""
    import json

    rows = db.execute(
        "SELECT content_hash, act FROM logline_acts WHERE did = ? AND this = ? AND status = 'active' "
        "ORDER BY inserted_at DESC, content_hash DESC",
        (AUTHENTICATOR_DID, identity),
    ).fetchall()
    for row in rows:
        revoked = db.execute(
            "SELECT 1 FROM logline_acts WHERE did = ? AND this = ? LIMIT 1",
            (AUTHENTICATOR_REVOKE_DID, row["content_hash"]),
        ).fetchone()
        if revoked is not None:
            continue
        act = json.loads(row["act"])
        return {
            "credential_id": act.get("credential_id"),
            "public_key": act.get("public_key"),
            "rp_id": act.get("rp_id"),
            "origin": act.get("origin"),
            "sign_count": int(act.get("sign_count") or 0),
            "enrollment_hash": row["content_hash"],
        }
    return None


def verify_signature(
    db: sqlite3.Connection,
    *,
    content_hash: str,
    identity: str,
    credential: Any,
    expected_rp_id: str = "",
    expected_origin: str = "",
) -> tuple[bool, str]:
    """Seam to the cryptographic binding layer (passkey/WebAuthn over content_hash).

    Verifies that ``identity`` (a recognized authority with an enrolled authenticator)
    produced ``credential`` — a WebAuthn assertion whose challenge is ``content_hash``.
    The actual crypto lives in the OPTIONAL ``lab.signing`` boundary; if that extra is
    not installed, this reports ``signature_layer_unavailable`` honestly rather than
    importing crypto into the kernel or faking success.
    """
    try:
        from .signing.webauthn_verifier import verify_act_signoff
    except ImportError:
        return False, "signature_layer_unavailable"
    return verify_act_signoff(
        db,
        content_hash=content_hash,
        identity=identity,
        credential=credential,
        expected_rp_id=expected_rp_id,
        expected_origin=expected_origin,
    )


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
