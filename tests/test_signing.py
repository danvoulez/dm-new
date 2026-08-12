"""Cryptographic signature-binding tests (Layer B, passkey/WebAuthn over content_hash).

Proven two ways, JCS-style:
  1. The OFFICIAL duo-labs recorded assertion vector verifies through our wrapper.
  2. A REAL ES256 round-trip — a software authenticator signs content_hash bytes with a
     genuine P-256 key, and we verify it end-to-end through the authority registry.

These require the optional crypto extra; the whole module skips cleanly without it, so
the zero-dependency test run stays green.
"""
import hashlib
import json

import pytest

pytest.importorskip("webauthn")

import cbor2  # noqa: E402  (pulled in by the webauthn extra)
from cryptography.hazmat.primitives import hashes  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from webauthn import base64url_to_bytes  # noqa: E402
from webauthn.helpers import bytes_to_base64url  # noqa: E402

from lab.authority import (  # noqa: E402
    enroll_authenticator,
    register_genesis_authority,
    verify_signature,
)
from lab.signing.webauthn_verifier import (  # noqa: E402
    enroll_verified_authenticator,
    verify_act_signoff,
    verify_assertion,
    verify_registration,
)
from lab.store import connect  # noqa: E402

RP_ID = "lab.minilab.work"
ORIGIN = "https://lab.minilab.work"

# --- Official duo-labs recorded vector (real authenticator capture) ---------------
_OFFICIAL_CRED = """{
  "id": "ZoIKP1JQvKdrYj1bTUPJ2eTUsbLeFkv-X5xJQNr4k6s",
  "rawId": "ZoIKP1JQvKdrYj1bTUPJ2eTUsbLeFkv-X5xJQNr4k6s",
  "response": {
    "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAQ",
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiaVBtQWkxUHAxWEw2b0FncTNQV1p0WlBuWmExekZVRG9HYmFRMF9LdlZHMWxGMnMzUnRfM280dVN6Y2N5MHRtY1RJcFRUVDRCVTFULUk0bWFhdm5kalEiLCJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjUwMDAiLCJjcm9zc09yaWdpbiI6ZmFsc2V9",
    "signature": "iOHKX3erU5_OYP_r_9HLZ-CexCE4bQRrxM8WmuoKTDdhAnZSeTP0sjECjvjfeS8MJzN1ArmvV0H0C3yy_FdRFfcpUPZzdZ7bBcmPh1XPdxRwY747OrIzcTLTFQUPdn1U-izCZtP_78VGw9pCpdMsv4CUzZdJbEcRtQuRS03qUjqDaovoJhOqEBmxJn9Wu8tBi_Qx7A33RbYjlfyLm_EDqimzDZhyietyop6XUcpKarKqVH0M6mMrM5zTjp8xf3W7odFCadXEJg-ERZqFM0-9Uup6kJNLbr6C5J4NDYmSm3HCSA6lp2iEiMPKU8Ii7QZ61kybXLxsX4w4Dm3fOLjmDw",
    "userHandle": "T1RWa1l6VXdPRFV0WW1NNVlTMDBOVEkxTFRnd056Z3RabVZpWVdZNFpEVm1ZMk5p"
  },
  "type": "public-key",
  "authenticatorAttachment": "cross-platform",
  "clientExtensionResults": {}
}"""
_OFFICIAL_CHALLENGE_B64 = "iPmAi1Pp1XL6oAgq3PWZtZPnZa1zFUDoGbaQ0_KvVG1lF2s3Rt_3o4uSzccy0tmcTIpTTT4BU1T-I4maavndjQ"
_OFFICIAL_PUBKEY_B64 = "pAEDAzkBACBZAQDfV20epzvQP-HtcdDpX-cGzdOxy73WQEvsU7Dnr9UWJophEfpngouvgnRLXaEUn_d8HGkp_HIx8rrpkx4BVs6X_B6ZjhLlezjIdJbLbVeb92BaEsmNn1HW2N9Xj2QM8cH-yx28_vCjf82ahQ9gyAr552Bn96G22n8jqFRQKdVpO-f-bvpvaP3IQ9F5LCX7CUaxptgbog1SFO6FI6ob5SlVVB00lVXsaYg8cIDZxCkkENkGiFPgwEaZ7995SCbiyCpUJbMqToLMgojPkAhWeyktu7TlK6UBWdJMHc3FPAIs0lH_2_2hKS-mGI1uZAFVAfW1X-mzKL0czUm2P1UlUox7IUMBAAE"


def test_official_recorded_vector_verifies_through_wrapper():
    # Treat the recorded 64-byte challenge as if it were a content_hash (hex form).
    challenge_hex = base64url_to_bytes(_OFFICIAL_CHALLENGE_B64).hex()
    ok, reason, _ = verify_assertion(
        credential=_OFFICIAL_CRED,
        public_key_b64url=_OFFICIAL_PUBKEY_B64,
        content_hash=challenge_hex,
        expected_rp_id="localhost",
        expected_origin="http://localhost:5000",
    )
    assert ok is True and reason == "assertion_verified"


# --- Real ES256 software authenticator (no hardware needed) ------------------------
def _make_authenticator():
    priv = ec.generate_private_key(ec.SECP256R1())
    nums = priv.public_key().public_numbers()
    cose = cbor2.dumps(
        {1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")}
    )
    return priv, bytes_to_base64url(cose)


def _sign(priv, *, content_hash, rp_id=RP_ID, origin=ORIGIN, flags=0x05, counter=1, credential_id=b"cred-1"):
    """Produce a WebAuthn assertion the way a real authenticator would, challenge=hash."""
    challenge = bytes.fromhex(content_hash)
    client_data = json.dumps(
        {"type": "webauthn.get", "challenge": bytes_to_base64url(challenge), "origin": origin, "crossOrigin": False},
        separators=(",", ":"),
    ).encode()
    auth_data = hashlib.sha256(rp_id.encode()).digest() + bytes([flags]) + counter.to_bytes(4, "big")
    signature = priv.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
    return json.dumps(
        {
            "id": bytes_to_base64url(credential_id),
            "rawId": bytes_to_base64url(credential_id),
            "response": {
                "authenticatorData": bytes_to_base64url(auth_data),
                "clientDataJSON": bytes_to_base64url(client_data),
                "signature": bytes_to_base64url(signature),
            },
            "type": "public-key",
            "clientExtensionResults": {},
        }
    )


def test_real_es256_roundtrip_binds_content_hash():
    priv, pub = _make_authenticator()
    content_hash = hashlib.sha256(b"a real act").hexdigest()
    cred = _sign(priv, content_hash=content_hash)
    ok, reason, _ = verify_assertion(
        credential=cred, public_key_b64url=pub, content_hash=content_hash,
        expected_rp_id=RP_ID, expected_origin=ORIGIN,
    )
    assert ok is True and reason == "assertion_verified"


def test_tampered_content_hash_is_rejected():
    priv, pub = _make_authenticator()
    cred = _sign(priv, content_hash=hashlib.sha256(b"the real act").hexdigest())
    ok, _reason, _ = verify_assertion(
        credential=cred, public_key_b64url=pub,
        content_hash=hashlib.sha256(b"a different act").hexdigest(),  # not what was signed
        expected_rp_id=RP_ID, expected_origin=ORIGIN,
    )
    assert ok is False


def test_wrong_public_key_is_rejected():
    priv, _pub = _make_authenticator()
    _priv2, other_pub = _make_authenticator()
    content_hash = hashlib.sha256(b"act").hexdigest()
    cred = _sign(priv, content_hash=content_hash)
    ok, _reason, _ = verify_assertion(
        credential=cred, public_key_b64url=other_pub, content_hash=content_hash,
        expected_rp_id=RP_ID, expected_origin=ORIGIN,
    )
    assert ok is False


def test_user_verification_is_required():
    priv, pub = _make_authenticator()
    content_hash = hashlib.sha256(b"act").hexdigest()
    cred = _sign(priv, content_hash=content_hash, flags=0x01)  # UP only, biometric/PIN not asserted
    ok, _reason, _ = verify_assertion(
        credential=cred, public_key_b64url=pub, content_hash=content_hash,
        expected_rp_id=RP_ID, expected_origin=ORIGIN, require_user_verification=True,
    )
    assert ok is False


def test_end_to_end_signoff_through_registry_and_seam():
    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")
    priv, pub = _make_authenticator()
    enroll_authenticator(
        db, "dan@minilab.work", credential_id=bytes_to_base64url(b"cred-1"), public_key=pub,
        rp_id=RP_ID, origin=ORIGIN, registered_by="dan@minilab.work",
    )
    content_hash = hashlib.sha256(b"grant act bytes").hexdigest()
    cred = _sign(priv, content_hash=content_hash)

    ok, reason = verify_act_signoff(db, content_hash=content_hash, identity="dan@minilab.work", credential=cred)
    assert ok is True and reason == "assertion_verified"

    ok2, _ = verify_signature(db, content_hash=content_hash, identity="dan@minilab.work", credential=cred)
    assert ok2 is True


def test_signoff_requires_enrolled_authenticator():
    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")  # authority, but no authenticator enrolled
    priv, _pub = _make_authenticator()
    content_hash = hashlib.sha256(b"x").hexdigest()
    cred = _sign(priv, content_hash=content_hash)
    ok, reason = verify_act_signoff(db, content_hash=content_hash, identity="dan@minilab.work", credential=cred)
    assert ok is False and reason == "no_enrolled_authenticator"


def test_signoff_from_unregistered_identity_is_rejected():
    db = connect(":memory:")
    priv, _pub = _make_authenticator()
    content_hash = hashlib.sha256(b"x").hexdigest()
    cred = _sign(priv, content_hash=content_hash)
    ok, reason = verify_act_signoff(db, content_hash=content_hash, identity="mallory", credential=cred)
    assert ok is False and reason == "unregistered_authority"


# --- #1: attestation-verified enrollment ------------------------------------------
def _register(priv, *, challenge_hash, rp_id=RP_ID, origin=ORIGIN, credential_id=b"cred-1", flags=0x45, counter=0):
    """Build a WebAuthn registration (attestation fmt=none) for priv's public key."""
    nums = priv.public_key().public_numbers()
    cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
    challenge = bytes.fromhex(challenge_hash)
    att_cred = (b"\x00" * 16) + len(credential_id).to_bytes(2, "big") + credential_id + cose
    auth_data = hashlib.sha256(rp_id.encode()).digest() + bytes([flags]) + counter.to_bytes(4, "big") + att_cred
    att_obj = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
    client_data = json.dumps(
        {"type": "webauthn.create", "challenge": bytes_to_base64url(challenge), "origin": origin, "crossOrigin": False},
        separators=(",", ":"),
    ).encode()
    return json.dumps(
        {
            "id": bytes_to_base64url(credential_id),
            "rawId": bytes_to_base64url(credential_id),
            "response": {
                "attestationObject": bytes_to_base64url(att_obj),
                "clientDataJSON": bytes_to_base64url(client_data),
            },
            "type": "public-key",
            "clientExtensionResults": {},
        }
    )


def test_attestation_registration_extracts_public_key():
    priv, _ = _make_authenticator()
    challenge_hash = hashlib.sha256(b"enrollment act").hexdigest()
    reg = _register(priv, challenge_hash=challenge_hash)
    ok, reason, material = verify_registration(
        credential=reg, challenge_hash=challenge_hash, expected_rp_id=RP_ID, expected_origin=ORIGIN
    )
    assert ok is True and reason == "registration_verified"
    assert material["public_key"] and material["sign_count"] == 0


def test_attestation_registration_rejects_wrong_challenge():
    priv, _ = _make_authenticator()
    reg = _register(priv, challenge_hash=hashlib.sha256(b"real").hexdigest())
    ok, _reason, material = verify_registration(
        credential=reg, challenge_hash=hashlib.sha256(b"other").hexdigest(),
        expected_rp_id=RP_ID, expected_origin=ORIGIN,
    )
    assert ok is False and material is None


def test_attested_enrollment_then_signoff_end_to_end():
    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")
    priv, _ = _make_authenticator()
    enroll_challenge = hashlib.sha256(b"dan enrollment act").hexdigest()
    reg = _register(priv, challenge_hash=enroll_challenge)
    ok, reason, _act = enroll_verified_authenticator(
        db, "dan@minilab.work", credential=reg, challenge_hash=enroll_challenge,
        rp_id=RP_ID, origin=ORIGIN, registered_by="dan@minilab.work",
    )
    assert ok is True and reason == "enrolled"
    # The same hardware key can now sign acts that verify against the extracted pubkey.
    content_hash = hashlib.sha256(b"some grant").hexdigest()
    cred = _sign(priv, content_hash=content_hash)
    ok2, reason2 = verify_act_signoff(db, content_hash=content_hash, identity="dan@minilab.work", credential=cred)
    assert ok2 is True and reason2 == "assertion_verified"


# --- #2: L4/L5 executor requires a verified signed grant (crown end-to-end) --------
def test_executor_reaches_adapter_only_with_valid_signed_grant():
    from lab.grants import record_grant_signoff, register_grant
    from lab.runtime import executor_run_once, queue_add, queue_list
    from lab.store import append, get

    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")
    priv, _ = _make_authenticator()
    enroll_challenge = hashlib.sha256(b"enroll").hexdigest()
    reg = _register(priv, challenge_hash=enroll_challenge)
    enroll_verified_authenticator(
        db, "dan@minilab.work", credential=reg, challenge_hash=enroll_challenge,
        rp_id=RP_ID, origin=ORIGIN, registered_by="dan@minilab.work",
    )
    g = register_grant(
        db, process="worker-run.v1", granted_by="dan@minilab.work", granted_to="tester",
        adapter="*", valid_until="2099-01-01T00:00:00Z", acu_limit=1, timeout_seconds=30,
        fs_scope="/Lab/workers/test", network_policy="none",
    )
    # The granting authority passkey-signs the grant's own content_hash.
    record_grant_signoff(db, g["id"], signer="dan@minilab.work", credential=_sign(priv, content_hash=g["id"]))

    src = append(db, {
        "who": "tester", "did": "registered", "this": "runtime", "when": "2026-06-22T00:00:00Z",
        "confirmed_by": "test", "if_ok": "worker-run.v1", "if_doubt": "attention-raise.v1",
        "if_not": "stop", "status": "registered", "process_id": "worker-run.v1", "grant_id": g["id"],
    })
    # Queue the contract's real adapter (the executor revalidates the queued adapter
    # against the contract now).
    queue_add(db, src["id"], "worker-run.v1", adapter="worker_run")
    closed = executor_run_once(db)
    result = get(db, closed["result_hash"])
    # Grant verified + passkey signoff verified — every dangerous-work gate passed. The
    # only remaining barrier is that 'worker_run' has no registered adapter, so the work
    # fails closed at the adapter gate (reason is adapter_not_registered, never a grant_*
    # reason — proving the full grant/signoff chain was satisfied first).
    assert result["status"] == "doubted"
    assert result["did"] == "not_dispatched"
    assert result["reason"] == "adapter_not_registered"
    assert queue_list(db, "failed") == []
