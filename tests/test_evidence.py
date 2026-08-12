"""Evidence-obligation enforcement (gap #6).

"A result receipt exists" is not "the declared evidence obligation was proven." The
executor must verify a contract's evidence_must_include against what the adapter
actually produced, and refuse to close `fechado` over a ghost.
"""
import lab.adapters as adapters_mod
from lab.evaluator import evaluate
from lab.inference import build_inference_request
from lab.runtime import executor_run_once, missing_evidence, queue_add
from lab.store import connect, get


def _inference_receipt(**extra):
    base = {
        "who": "lab.cli", "did": "requested_inference", "this": "summarize", "when": "2026-06-22T00:00:00Z",
        "confirmed_by": "lab.cli", "if_ok": "inference.v1", "if_doubt": "attention-raise.v1",
        "if_not": "no_model", "status": "candidate",
    }
    base.update(extra)
    return base


def test_missing_evidence_detects_absent_and_empty_values():
    assert missing_evidence(["a", "b"], {"a": "x", "b": "y"}) == []
    assert missing_evidence(["a", "b"], {"a": "x"}) == ["b"]
    assert missing_evidence(["a"], {"a": ""}) == ["a"]
    assert missing_evidence(["a"], {"a": []}) == ["a"]      # empty list is not evidence
    assert missing_evidence(["a"], {"a": None}) == ["a"]
    assert missing_evidence([], {}) == []


def test_evaluator_surfaces_evidence_must_include():
    out = evaluate(_inference_receipt(), "inference.v1")
    assert out["evidence_must_include"] == ["output_hash", "schema_hash"]


def test_executor_closes_fechado_when_evidence_is_present():
    db = connect(":memory:")
    req = build_inference_request(db, "summarize", model_id="claude-opus-4-8", schema_id="summary.v1")
    queue_add(db, req["id"], "inference.v1", adapter="inference")
    closed = executor_run_once(db)
    result = get(db, closed["result_hash"])
    assert result["status"] == "fechado"
    # the obligation's fields are actually carried by the result, not merely asserted
    assert result["output_hash"] and result["schema_hash"]


def test_executor_refuses_to_close_when_evidence_is_missing(monkeypatch):
    db = connect(":memory:")
    req = build_inference_request(db, "summarize", model_id="claude-opus-4-8", schema_id="summary.v1")

    # A plastic adapter: returns a result but omits the declared output_hash evidence.
    def faulty_adapter(source, queue_item):
        return {"adapter_class": "inference.dry_run", "external_effect": False, "schema_hash": "abc123"}

    monkeypatch.setitem(adapters_mod.REGISTRY, "inference", faulty_adapter)
    queue_add(db, req["id"], "inference.v1", adapter="inference")
    closed = executor_run_once(db)
    result = get(db, closed["result_hash"])

    assert closed["status"] == "closed"          # queue item is resolved, not left dangling
    assert result["status"] == "doubted"          # but NOT a fake fechado
    assert result["did"] == "evidence_incomplete"
    assert result["reason"] == "evidence_obligation_unmet"
    assert result["missing_evidence"] == ["output_hash"]
    assert result["schema_hash"] == "abc123"      # what the adapter DID produce is preserved for triage
