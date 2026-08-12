"""Unit tests for the grant registry (LAB FINAL SPEC v0 §13).

The executor integration tests in test_runtime.py exercise grant verification
end-to-end; these pin the module primitives directly and cover the verify_grant
branches that integration doesn't reach.
"""
import pytest

from lab.store import connect
from lab.authority import authority_recognized, register_genesis_authority
from lab.grants import (
    is_revoked,
    register_grant,
    resolve_grant,
    revoke_grant,
    verify_grant,
)


def _grant(db, **over):
    register_genesis_authority(db, "dan@minilab.work")  # the signer must be a recognized authority
    fields = dict(
        process="worker-run.v1",
        granted_by="dan@minilab.work",
        granted_to="tester",
        adapter="worker_run",
        valid_until="2099-01-01T00:00:00Z",
        acu_limit=2,
        timeout_seconds=30,
        fs_scope="/Lab/workers/test",
        network_policy="none",
    )
    fields.update(over)
    return register_grant(db, **fields)


def _ok(db, grant, **over):
    kwargs = dict(
        source={"who": "tester"},
        process_id="worker-run.v1",
        effective_adapter="worker_run",
        required_acu=1,
        allowed_who=(),
    )
    kwargs.update(over)
    return verify_grant(db, grant, **kwargs)


def test_register_resolve_roundtrip_preserves_fields():
    db = connect(":memory:")
    g = register_grant(
        db,
        process="worker-run.v1",
        granted_by="dan@minilab.work",
        granted_to="tester",
        adapter="worker_run",
        valid_until="2099-01-01T00:00:00Z",
        acu_limit=5,
        timeout_seconds=60,
        fs_scope="/Lab/x",
        network_policy="restricted",
    )
    resolved = resolve_grant(db, g["id"])
    assert resolved is not None
    assert resolved["did"] == "grant"
    assert resolved["status"] == "granted"
    assert resolved["process"] == "worker-run.v1"
    assert resolved["granted_to"] == "tester"
    assert resolved["acu_limit"] == 5
    assert resolved["network_policy"] == "restricted"


def test_resolve_returns_none_for_missing_or_non_grant():
    db = connect(":memory:")
    assert resolve_grant(db, None) is None
    assert resolve_grant(db, "grant:nope") is None


def test_authority_recognized_requires_registration():
    db = connect(":memory:")
    assert authority_recognized(db, "") == (False, "missing_authority")
    assert authority_recognized(db, "   ") == (False, "missing_authority")
    # A non-empty but unregistered signer is no longer provisionally accepted.
    assert authority_recognized(db, "mallory") == (False, "unregistered_authority")
    register_genesis_authority(db, "dan@minilab.work")
    assert authority_recognized(db, "dan@minilab.work") == (True, "authority_registered")


def test_verify_grant_rejects_unregistered_signer():
    db = connect(":memory:")
    # No genesis registered: even a well-formed grant from a plausible signer fails.
    g = register_grant(
        db,
        process="worker-run.v1",
        granted_by="mallory",
        granted_to="tester",
        adapter="worker_run",
        valid_until="2099-01-01T00:00:00Z",
        acu_limit=2,
        timeout_seconds=30,
        fs_scope="/Lab/x",
        network_policy="none",
    )
    ok, reason = _ok(db, g)
    assert ok is False and reason == "unregistered_authority"


def test_revocation_is_append_only_and_observable():
    db = connect(":memory:")
    g = _grant(db)
    assert is_revoked(db, g["id"]) is False
    revoke_grant(db, g["id"], revoked_by="dan@minilab.work")
    assert is_revoked(db, g["id"]) is True


def test_verify_grant_happy_path():
    db = connect(":memory:")
    g = _grant(db)
    ok, reason = _ok(db, g)
    assert ok is True and reason == "grant_ok"


def test_verify_grant_adapter_mismatch():
    db = connect(":memory:")
    g = _grant(db, adapter="workflow_run")
    ok, reason = _ok(db, g)
    assert ok is False and reason == "grant_adapter_mismatch"


def test_verify_grant_wildcards_match_any_process_and_adapter():
    db = connect(":memory:")
    g = _grant(db, process="*", adapter="*", granted_to="*")
    ok, reason = _ok(db, g, source={"who": "anyone"}, process_id="something-else.v1", effective_adapter="x")
    assert ok is True and reason == "grant_ok"


def test_verify_grant_allowed_who_not_authorized():
    db = connect(":memory:")
    g = _grant(db)
    ok, reason = _ok(db, g, allowed_who=("someone-else",))
    assert ok is False and reason == "who_not_authorized"


def test_verify_grant_missing_expiry():
    db = connect(":memory:")
    g = _grant(db, valid_until="")
    ok, reason = _ok(db, g)
    assert ok is False and reason == "missing_grant_expiry"


def test_verify_grant_missing_timeout():
    db = connect(":memory:")
    g = _grant(db, timeout_seconds=0)
    ok, reason = _ok(db, g)
    assert ok is False and reason == "missing_timeout"


def test_verify_grant_bad_network_policy():
    db = connect(":memory:")
    g = _grant(db, network_policy="wide-open")
    ok, reason = _ok(db, g)
    assert ok is False and reason == "missing_network_policy"


def test_verify_grant_revoked_beats_other_checks():
    db = connect(":memory:")
    g = _grant(db)
    revoke_grant(db, g["id"], revoked_by="dan@minilab.work")
    ok, reason = _ok(db, g)
    assert ok is False and reason == "grant_revoked"
