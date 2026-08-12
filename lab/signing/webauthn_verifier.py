"""WebAuthn (FIDO2) assertion verification — the cryptographic binding layer.

This wraps the reference py_webauthn library (PyPI ``webauthn``, duo-labs — the same
library PyPI/warehouse uses in production). We do NOT implement crypto ourselves; this
module only adapts the LogLine model to the standard verifier.

The LogLine-native binding: an Act's ``content_hash`` IS the WebAuthn challenge. A
passkey assertion that verifies therefore proves a hardware-bound, biometric-gated
human signed *exactly this Act* — something an LLM (no enclave, no finger) cannot forge.
Integrity comes from the hash; authorship comes from this assertion.

Threat-model note: WebAuthn binds the key to an RP origin/id. Treat ``rp_id`` /
``origin`` as part of the Lab's signing domain (e.g. the membrane's origin), pinned at
enrollment, so an assertion minted for some other site cannot be replayed here.
"""
from __future__ import annotations

from typing import Any

from webauthn import (
    base64url_to_bytes,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import bytes_to_base64url
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)


def verify_assertion(
    *,
    credential: Any,
    public_key_b64url: str,
    content_hash: str,
    expected_rp_id: str,
    expected_origin: str | list[str],
    current_sign_count: int = 0,
    require_user_verification: bool = True,
) -> tuple[bool, str, int | None]:
    """Verify a WebAuthn assertion whose challenge is ``content_hash``.

    Returns ``(ok, reason, new_sign_count)``. ``require_user_verification=True`` demands
    the authenticator asserted user verification (biometric/PIN), not mere presence.
    """
    try:
        challenge = bytes.fromhex(content_hash)
    except (ValueError, TypeError):
        return False, "content_hash_not_hex", None
    if not public_key_b64url:
        return False, "no_enrolled_public_key", None
    try:
        result = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=expected_rp_id,
            expected_origin=expected_origin,
            credential_public_key=base64url_to_bytes(public_key_b64url),
            credential_current_sign_count=current_sign_count,
            require_user_verification=require_user_verification,
        )
    except InvalidAuthenticationResponse as exc:
        return False, f"assertion_invalid: {exc}", None
    return True, "assertion_verified", result.new_sign_count


def verify_registration(
    *,
    credential: Any,
    challenge_hash: str,
    expected_rp_id: str,
    expected_origin: str | list[str],
    require_user_verification: bool = True,
) -> tuple[bool, str, dict[str, Any] | None]:
    """Verify a WebAuthn registration (attestation) and extract the credential material.

    Returns ``(ok, reason, material)`` where material is
    ``{credential_id, public_key, sign_count, aaguid}`` (b64url strings + int). The
    challenge is the hex ``challenge_hash`` (e.g. an authority enrollment Act's hash),
    so the enrolled key is bound to a specific registered Act rather than trusted blind.
    """
    try:
        challenge = bytes.fromhex(challenge_hash)
    except (ValueError, TypeError):
        return False, "challenge_not_hex", None
    try:
        reg = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=expected_rp_id,
            expected_origin=expected_origin,
            require_user_verification=require_user_verification,
        )
    except InvalidRegistrationResponse as exc:
        return False, f"registration_invalid: {exc}", None
    return True, "registration_verified", {
        "credential_id": bytes_to_base64url(reg.credential_id),
        "public_key": bytes_to_base64url(reg.credential_public_key),
        "sign_count": int(reg.sign_count),
        "aaguid": str(getattr(reg, "aaguid", "") or ""),
    }


def enroll_verified_authenticator(
    db,
    identity: str,
    *,
    credential: Any,
    challenge_hash: str,
    rp_id: str,
    origin: str,
    registered_by: str,
    require_user_verification: bool = True,
) -> tuple[bool, str, dict[str, Any] | None]:
    """Attestation-verified enrollment: verify the registration, then store the key.

    Replaces "trust the handed-in pubkey" — the public key is *extracted from a verified
    WebAuthn attestation*, not asserted. Storage stays in the zero-dep core via
    ``authority.enroll_authenticator``.
    """
    ok, reason, material = verify_registration(
        credential=credential,
        challenge_hash=challenge_hash,
        expected_rp_id=rp_id,
        expected_origin=origin,
        require_user_verification=require_user_verification,
    )
    if not ok or material is None:
        return False, reason, None
    from ..authority import enroll_authenticator

    act = enroll_authenticator(
        db,
        identity,
        credential_id=material["credential_id"],
        public_key=material["public_key"],
        rp_id=rp_id,
        origin=origin,
        registered_by=registered_by,
        sign_count=material["sign_count"],
        aaguid=material["aaguid"],
    )
    return True, "enrolled", act


def verify_act_signoff(
    db,
    *,
    content_hash: str,
    identity: str,
    credential: Any,
    expected_rp_id: str = "",
    expected_origin: str = "",
) -> tuple[bool, str]:
    """End-to-end: did a recognized authority cryptographically sign this Act?

    Checks ``identity`` is a recognized authority, finds its enrolled authenticator, and
    verifies the assertion against the Act's ``content_hash``. The enrollment's pinned
    ``rp_id``/``origin`` win over the passed-in defaults (the signing domain is fixed at
    enrollment, not chosen at verify time).
    """
    from ..authority import authority_recognized, get_authenticator

    ok, reason = authority_recognized(db, identity)
    if not ok:
        return False, reason
    enrollment = get_authenticator(db, identity)
    if enrollment is None:
        return False, "no_enrolled_authenticator"
    ok, reason, _new_count = verify_assertion(
        credential=credential,
        public_key_b64url=enrollment.get("public_key") or "",
        content_hash=content_hash,
        expected_rp_id=enrollment.get("rp_id") or expected_rp_id,
        expected_origin=enrollment.get("origin") or expected_origin,
        current_sign_count=int(enrollment.get("sign_count") or 0),
    )
    return ok, reason
