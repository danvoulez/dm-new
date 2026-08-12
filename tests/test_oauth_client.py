"""oauth-client.v1 — the OAuth 2.1 client registration boundary.

The kernel never calls Supabase. It resolves the contract's adapter, builds the
canonical RFC 7591 request deterministically, and returns AUX whose evidence
satisfies the contract's evidence_must_include. The real POST is an edge effect.
"""
import pytest

from lab.store import connect, append, get
from lab.evaluator import evaluate
from lab.runtime import receiver_select, queue_list
from lab.oauth import (
    run_oauth_client_adapter,
    client_metadata,
    resolve_auth_method,
    build_oauth_client_request,
    ADMIN_ENDPOINT,
)
from lab.process_catalog import build_runnable_processes
from lab.errors import AdapterError


def full(**extra):
    base = {
        "who": "tester", "did": "registered", "this": "LAB Passport",
        "when": "2026-06-22T00:00:00Z", "confirmed_by": "test",
        "if_ok": "memory-register.v1", "if_doubt": "attention-raise.v1",
        "if_not": "stop", "status": "registered",
    }
    base.update(extra)
    return base


def passport_act(**extra):
    fields = {
        "if_ok": "oauth-client.v1",
        "client_name": "LAB Passport",
        "redirect_uris": ["https://passport.minilab.work/auth/callback"],
        "client_type": "confidential",
        "lab_id": "lab:abc123",
    }
    fields.update(extra)
    return full(**fields)


# --- contract wiring ---------------------------------------------------------

def test_contract_is_runnable():
    """The contract + registered adapter make oauth-client.v1 runnable, not contract-only."""
    runnable = {p["process_id"]: p for p in build_runnable_processes()["processes"]}
    assert "oauth-client.v1" in runnable
    assert runnable["oauth-client.v1"]["status"] == "runnable"
    assert runnable["oauth-client.v1"]["adapters"] == ["oauth-client"]


def test_evaluator_resolves_the_oauth_adapter():
    out = evaluate(passport_act(), "oauth-client.v1")
    assert out["matched"] is True
    assert out["activate"] is True
    assert out["adapter"] == "oauth-client"


def test_complete_act_enqueues_oauth_adapter_not_receipt():
    db = connect(":memory:")
    append(db, passport_act())
    receiver_select(db, "oauth-client.v1")
    queued = queue_list(db, "all")
    assert len(queued) == 1
    assert queued[0]["process_id"] == "oauth-client.v1"
    assert queued[0]["adapter"] == "oauth-client"


# --- adapter semantics (dry-run boundary) ------------------------------------

def test_adapter_never_calls_the_api():
    aux = run_oauth_client_adapter(passport_act(), {})
    assert aux["external_effect"] is False
    assert aux["api_called"] is False
    assert aux["endpoint"] == ADMIN_ENDPOINT


def test_adapter_evidence_satisfies_contract_obligation():
    """evidence_must_include: [request_hash, client_metadata_hash] must be present."""
    aux = run_oauth_client_adapter(passport_act(), {})
    for key in ("request_hash", "client_metadata_hash"):
        assert key in aux and isinstance(aux[key], str) and len(aux[key]) == 64


def test_request_hash_is_deterministic():
    a = run_oauth_client_adapter(passport_act(), {})
    b = run_oauth_client_adapter(passport_act(), {})
    assert a["request_hash"] == b["request_hash"]
    assert a["client_metadata_hash"] == b["client_metadata_hash"]


def test_adapter_emits_candidate_citing_the_source_and_lab_id():
    src = passport_act()
    src["id"] = "source-hash-xyz"
    aux = run_oauth_client_adapter(src, {})
    assert len(aux["candidate_acts"]) == 1
    cand = aux["candidate_acts"][0]
    assert cand["this"] == "source-hash-xyz"
    assert cand["lab_id"] == "lab:abc123"
    assert cand["request_hash"] == aux["request_hash"]


# --- RFC 7591 validation -----------------------------------------------------

def test_confidential_client_cannot_be_public_auth():
    with pytest.raises(AdapterError):
        resolve_auth_method("confidential", "none")


def test_public_client_must_be_none_auth():
    assert resolve_auth_method("public", None) == "none"
    with pytest.raises(AdapterError):
        resolve_auth_method("public", "client_secret_basic")


def test_confidential_defaults_to_client_secret_basic():
    meta = client_metadata(passport_act())
    assert meta["token_endpoint_auth_method"] == "client_secret_basic"


def test_empty_redirect_uris_is_rejected():
    with pytest.raises(AdapterError):
        client_metadata(passport_act(redirect_uris=[]))


# --- request builder records intent as a candidate Act -----------------------

def test_build_request_persists_a_candidate_act():
    db = connect(":memory:")
    act = build_oauth_client_request(
        db,
        "LAB Passport",
        redirect_uris=["https://passport.minilab.work/auth/callback"],
        lab_id="lab:abc123",
    )
    stored = get(db, act["id"])
    assert stored["if_ok"] == "oauth-client.v1"
    assert stored["status"] == "candidate"
    assert stored["api_called"] is False
    assert stored["lab_id"] == "lab:abc123"
