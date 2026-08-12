"""Day 2 §17 — doubt/result molds are a stable, closed vocabulary.

Pins docs/RECEIPT_MOLDS.md: every reason the runtime can emit belongs to exactly one mold
family, and real doubt/result receipts conform to their mold. Catches reason drift and any
new reason that forgets to declare itself.
"""
import lab.adapters as adapters_mod
from lab.runtime import (
    DOUBT_REASONS,
    executor_run_once,
    queue_add,
    receiver_select,
)
from lab.store import append, connect, get

# The family → reasons map mirrors docs/RECEIPT_MOLDS.md exactly.
MOLD_FAMILIES = {
    "doubt.no_adapter_configured": {"no_adapter_configured", "adapter_not_registered"},
    "doubt.dispatch_mismatch": {"dispatch_mismatch"},
    "doubt.adapter_rejected": {"adapter_rejected"},
    "doubt.contract": {"no_matching_process_contract", "process_not_active", "incomplete"},
    "doubt.grant_required": {"missing_required_grant"},
    "doubt.grant_invalid": {
        "grant_not_found", "grant_subject_mismatch", "grant_process_mismatch",
        "grant_adapter_mismatch", "who_not_authorized", "grant_not_active", "grant_revoked",
        "grant_expired", "missing_grant_expiry", "missing_timeout", "missing_sandbox_scope",
        "missing_network_policy", "budget_exhausted",
    },
    "doubt.authority": {
        "missing_authority", "unregistered_authority", "grant_unsigned",
        "signoff_signer_mismatch", "signature_layer_unavailable",
    },
    "doubt.evidence_incomplete": {"evidence_obligation_unmet"},
}

DOUBT_STATUS = "doubted"
REQUIRED_DOUBT_KEYS = {"who", "did", "this", "when", "confirmed_by", "status", "reason", "process_id"}


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': 'memory-register.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered',
    }
    base.update(extra)
    return base


def test_mold_families_partition_the_canonical_vocabulary():
    """Every declared reason is in exactly one family; no orphan reasons, no extras."""
    union = set()
    for reasons in MOLD_FAMILIES.values():
        assert union.isdisjoint(reasons), "a reason appears in two families"
        union |= reasons
    assert union == set(DOUBT_REASONS)


def test_contract_only_doubt_conforms_to_mold():
    db = connect(":memory:")
    append(db, full(if_ok="attention-raise.v1"))
    selected = receiver_select(db, "attention-raise.v1")
    doubt = get(db, selected[0]["doubt"])
    assert REQUIRED_DOUBT_KEYS <= set(doubt)
    assert doubt["status"] == DOUBT_STATUS
    assert doubt["reason"] in MOLD_FAMILIES["doubt.no_adapter_configured"]


def test_dispatch_mismatch_doubt_conforms_to_mold():
    db = connect(":memory:")
    act = append(db, full(if_ok="projection-build.v1"))
    queue_add(db, act["id"], "projection-build.v1", adapter="receipt")  # corrupt row
    result = get(db, executor_run_once(db)["result_hash"])
    assert result["status"] == DOUBT_STATUS
    assert result["reason"] in MOLD_FAMILIES["doubt.dispatch_mismatch"]


def test_grant_required_doubt_conforms_to_mold():
    db = connect(":memory:")
    act = append(db, full(if_ok="worker-run.v1", process_id="worker-run.v1"))
    queue_add(db, act["id"], "worker-run.v1", adapter="worker_run")
    result = get(db, executor_run_once(db)["result_hash"])
    assert result["status"] == DOUBT_STATUS
    assert result["reason"] in MOLD_FAMILIES["doubt.grant_required"]


def test_evidence_incomplete_doubt_conforms_to_mold(monkeypatch):
    from lab.inference import build_inference_request
    db = connect(":memory:")
    req = build_inference_request(db, "summarize", model_id="claude-opus-4-8", schema_id="summary.v1")
    monkeypatch.setitem(adapters_mod.REGISTRY, "inference", lambda s, i: {"schema_hash": "z"})
    queue_add(db, req["id"], "inference.v1", adapter="inference")
    result = get(db, executor_run_once(db)["result_hash"])
    assert result["status"] == DOUBT_STATUS
    assert result["reason"] in MOLD_FAMILIES["doubt.evidence_incomplete"]


def test_clean_result_mold_is_fechado():
    db = connect(":memory:")
    act = append(db, full())
    queue_add(db, act["id"], "memory-register.v1", adapter="receipt")
    result = get(db, executor_run_once(db)["result_hash"])
    assert result["status"] == "fechado"
    assert result["did"] in {"fechado", "llm.receipt"}
