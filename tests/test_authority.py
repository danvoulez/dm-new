"""Authority registry tests (LAB FINAL SPEC v0 §13, structural layer)."""
import pytest

from lab.errors import AuthorityError
from lab.store import connect
from lab.authority import (
    authority_recognized,
    is_authority,
    register_authority,
    register_genesis_authority,
    revoke_authority,
    verify_signature,
)


def test_genesis_authority_is_self_attested_and_recognized():
    db = connect(":memory:")
    g = register_genesis_authority(db, "dan@minilab.work")
    assert g["did"] == "authority"
    assert g["this"] == "dan@minilab.work"
    assert g["registered_by"] == "dan@minilab.work"
    assert g["genesis"] is True
    assert is_authority(db, "dan@minilab.work") is True
    assert authority_recognized(db, "dan@minilab.work") == (True, "authority_registered")


def test_unregistered_identity_is_not_recognized():
    db = connect(":memory:")
    assert authority_recognized(db, "stranger") == (False, "unregistered_authority")
    assert authority_recognized(db, "") == (False, "missing_authority")


def test_authority_can_register_another_authority():
    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")
    register_authority(db, "ops@minilab.work", registered_by="dan@minilab.work")
    assert is_authority(db, "ops@minilab.work") is True


def test_non_authority_cannot_register_an_authority():
    db = connect(":memory:")
    with pytest.raises(AuthorityError):
        register_authority(db, "ops@minilab.work", registered_by="stranger")


def test_revocation_removes_recognition_and_is_append_only():
    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")
    register_authority(db, "ops@minilab.work", registered_by="dan@minilab.work")
    assert is_authority(db, "ops@minilab.work") is True
    revoke_authority(db, "ops@minilab.work", revoked_by="dan@minilab.work")
    assert is_authority(db, "ops@minilab.work") is False
    assert authority_recognized(db, "ops@minilab.work") == (False, "unregistered_authority")


def test_revoker_must_be_a_recognized_authority():
    db = connect(":memory:")
    register_genesis_authority(db, "dan@minilab.work")
    with pytest.raises(AuthorityError):
        revoke_authority(db, "dan@minilab.work", revoked_by="stranger")


def test_verify_signature_seam_refuses_unknown_signer_or_degrades():
    # The seam delegates to the optional crypto layer. Either that layer is absent
    # (honest "unavailable") or it's present and an unregistered signer is refused by
    # the registry before any crypto runs. Never a silent pass.
    db = connect(":memory:")
    ok, reason = verify_signature(db, content_hash="00" * 32, identity="nobody", credential="{}")
    assert ok is False
    assert reason in {"signature_layer_unavailable", "unregistered_authority", "missing_authority"}
