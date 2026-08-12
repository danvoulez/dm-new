"""Grant registry — authority as registered structure (LAB FINAL SPEC v0 §13).

"Authority is not vibe. Authority is registered structure. A grant is itself a
registered object." Dangerous (L4/L5) movement may name a ``grant_id``; this module
turns that name into a *resolved, verified* grant rather than letting the requesting
Act self-assert its own validity window, budget, or sandbox scope.

A grant is an append-only Act in ``logline_acts`` (``did='grant'``) declaring, per
§13: adapter, process, granted_by, granted_to, validity window, ACU limit, timeout,
filesystem scope, network policy (fanout/depth/evidence/blast-radius optional). Its
content hash is its ``grant_id``. A grant may be revoked by a later append-only Act
(``did='grant-revoke'`` citing the grant id) — revocation is never a silent delete.

The signer root-of-trust (``authority_recognized``) is a deliberate, clearly-marked
seam: the model for what makes a ``granted_by`` legitimate in this Lab is being
decided after this prototype. It is NOT a silent no-op — it refuses an empty signer.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from .authority import authority_recognized, verify_signature
from .store import append, get

GRANT_DID = "grant"
REVOKE_DID = "grant-revoke"
SIGNOFF_DID = "grant-signoff"
WILDCARD = "*"
NETWORK_POLICIES = {"none", "restricted", "open"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def register_grant(
    db: sqlite3.Connection,
    *,
    process: str,
    granted_by: str,
    granted_to: str,
    adapter: str = WILDCARD,
    valid_until: str = "",
    acu_limit: int = 0,
    timeout_seconds: int = 0,
    fs_scope: str = "",
    network_policy: str = "none",
    **extra: Any,
) -> dict[str, Any]:
    """Register a grant Act. Its content hash is the ``grant_id`` callers reference.

    The §13 fields live on the grant, not on the work that consumes it — that is the
    whole point: the executor reads authority from here, not from the requester.
    """
    fields: dict[str, Any] = {
        "who": granted_by,
        "did": GRANT_DID,
        "this": granted_to,
        "when": datetime.now(timezone.utc).isoformat(),
        "confirmed_by": granted_by,
        "if_ok": "grant-consume.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "executor.skip",
        "status": "granted",
        "adapter": adapter,
        "process": process,
        "granted_by": granted_by,
        "granted_to": granted_to,
        "valid_until": valid_until,
        "acu_limit": int(acu_limit),
        "timeout_seconds": int(timeout_seconds),
        "fs_scope": fs_scope,
        "network_policy": network_policy,
    }
    fields.update(extra)
    return append(db, fields)


def revoke_grant(db: sqlite3.Connection, grant_id: str, *, revoked_by: str, reason: str = "revoked") -> dict[str, Any]:
    """Append a revocation Act citing ``grant_id``. Append-only, never a delete."""
    return append(
        db,
        {
            "who": revoked_by,
            "did": REVOKE_DID,
            "this": grant_id,
            "when": datetime.now(timezone.utc).isoformat(),
            "confirmed_by": revoked_by,
            "if_ok": "attention-raise.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "revoked",
            "reason": reason,
        },
    )


def resolve_grant(db: sqlite3.Connection, grant_id: str | None) -> dict[str, Any] | None:
    """Return the registered grant Act for ``grant_id``, or None if it isn't one."""
    if not grant_id:
        return None
    act = get(db, grant_id)
    if act is None or act.get("did") != GRANT_DID:
        return None
    return act


def list_grants(db: sqlite3.Connection, *, limit: int = 20) -> list[dict[str, Any]]:
    """Registered grants, newest first, each with its live standing.

    A read surface for operators and interfaces: the grant Act alone does not say
    whether it is revoked, signed, or past its window, and those are exactly the
    three things a human needs before deciding anything.
    """
    import json

    rows = db.execute(
        "SELECT content_hash, act FROM logline_acts WHERE did = ? ORDER BY inserted_at DESC, content_hash DESC LIMIT ?",
        (GRANT_DID, limit),
    ).fetchall()
    return [_standing(db, json.loads(row["act"])) for row in rows]


def _standing(db: sqlite3.Connection, grant: dict[str, Any]) -> dict[str, Any]:
    grant_id = grant.get("id", "")
    signoff = get_grant_signoff(db, grant_id)
    valid_until = _parse_time(grant.get("valid_until"))
    signed, signed_reason = require_grant_signoff(db, grant)
    return {
        "grant_id": grant_id,
        "process": grant.get("process"),
        "adapter": grant.get("adapter"),
        "granted_by": grant.get("granted_by"),
        "granted_to": grant.get("granted_to"),
        "valid_until": grant.get("valid_until") or None,
        "acu_limit": grant.get("acu_limit"),
        "timeout_seconds": grant.get("timeout_seconds"),
        "fs_scope": grant.get("fs_scope") or None,
        "network_policy": grant.get("network_policy"),
        "revoked": is_revoked(db, grant_id),
        "expired": bool(valid_until and valid_until <= _now()),
        "signed_off": signed,
        "signoff_reason": signed_reason,
        "signer": (signoff or {}).get("signer"),
    }


def grant_detail(db: sqlite3.Connection, grant_id: str) -> dict[str, Any]:
    grant = resolve_grant(db, grant_id)
    if grant is None:
        return {"grant_id": grant_id, "found": False}
    return {"found": True, **_standing(db, grant)}


def is_revoked(db: sqlite3.Connection, grant_id: str) -> bool:
    row = db.execute(
        "SELECT 1 FROM logline_acts WHERE did = ? AND this = ? LIMIT 1",
        (REVOKE_DID, grant_id),
    ).fetchone()
    return row is not None


def verify_grant(
    db: sqlite3.Connection,
    grant: dict[str, Any],
    *,
    source: dict[str, Any],
    process_id: str,
    effective_adapter: str | None,
    required_acu: int,
    allowed_who: tuple[str, ...] = (),
) -> tuple[bool, str]:
    """Verify a resolved grant authorizes this work. Returns ``(ok, reason)``.

    Checks run structural-first so that when a single field is wrong the reason names
    that field. Every ``False`` becomes a durable ``doubted`` close upstream — never a
    silent drop (§13).
    """
    grant_id = grant.get("id", "")
    if is_revoked(db, grant_id):
        return False, "grant_revoked"
    if grant.get("status") != "granted":
        return False, "grant_not_active"

    grant_process = grant.get("process")
    if grant_process not in (process_id, WILDCARD):
        return False, "grant_process_mismatch"

    grant_adapter = grant.get("adapter")
    if grant_adapter not in (effective_adapter, WILDCARD):
        return False, "grant_adapter_mismatch"

    source_who = source.get("who", "")
    granted_to = grant.get("granted_to")
    if granted_to not in (source_who, WILDCARD):
        return False, "grant_subject_mismatch"

    if allowed_who and source_who not in allowed_who:
        return False, "who_not_authorized"

    ok, reason = authority_recognized(db, grant.get("granted_by"))
    if not ok:
        return False, reason

    valid_until = _parse_time(grant.get("valid_until"))
    if valid_until is None:
        return False, "missing_grant_expiry"
    if valid_until <= _now():
        return False, "grant_expired"

    if int(grant.get("acu_limit") or 0) < required_acu:
        return False, "budget_exhausted"
    if int(grant.get("timeout_seconds") or 0) <= 0:
        return False, "missing_timeout"
    if not str(grant.get("fs_scope", "")).strip():
        return False, "missing_sandbox_scope"
    if str(grant.get("network_policy", "")).strip() not in NETWORK_POLICIES:
        return False, "missing_network_policy"

    return True, "grant_ok"


def record_grant_signoff(db: sqlite3.Connection, grant_id: str, *, signer: str, credential: Any) -> dict[str, Any]:
    """Record a passkey signoff over a grant's content_hash. Append-only.

    ``credential`` is the WebAuthn assertion (a JSON string) the granting authority's
    authenticator produced with challenge = the grant's content_hash. Storing it needs
    no crypto; verifying it (``require_grant_signoff``) does.
    """
    return append(
        db,
        {
            "who": signer,
            "did": SIGNOFF_DID,
            "this": grant_id,
            "when": datetime.now(timezone.utc).isoformat(),
            "confirmed_by": signer,
            "if_ok": "grant-armed.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "signed",
            "signer": signer,
            "credential": credential,
        },
    )


def get_grant_signoff(db: sqlite3.Connection, grant_id: str) -> dict[str, Any] | None:
    import json

    row = db.execute(
        "SELECT act FROM logline_acts WHERE did = ? AND this = ? AND status = 'signed' "
        "ORDER BY inserted_at DESC, content_hash DESC LIMIT 1",
        (SIGNOFF_DID, grant_id),
    ).fetchone()
    if row is None:
        return None
    act = json.loads(row["act"])
    return {"signer": act.get("signer") or act.get("who"), "credential": act.get("credential")}


def require_grant_signoff(db: sqlite3.Connection, grant: dict[str, Any]) -> tuple[bool, str]:
    """L4/L5 gate: a grant must carry a verified passkey signoff by its granting authority.

    Fail-closed: no signoff -> ``grant_unsigned``; signer mismatch -> ``signoff_signer_mismatch``;
    if the crypto extra is absent the seam returns ``signature_layer_unavailable`` and the
    work is blocked. An LLM (no enclave, no biometric) cannot satisfy this.
    """
    grant_id = grant.get("id", "")
    signoff = get_grant_signoff(db, grant_id)
    if signoff is None:
        return False, "grant_unsigned"
    if signoff.get("signer") != grant.get("granted_by"):
        return False, "signoff_signer_mismatch"
    return verify_signature(
        db,
        content_hash=grant_id,
        identity=grant.get("granted_by", ""),
        credential=signoff.get("credential"),
    )
