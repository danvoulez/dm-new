"""Day 2 §16 — when the proof exists, closure happens clean.

An adapter result carrying every declared ``evidence_must_include`` field closes ``fechado``
with the evidence actually present on the result (not merely asserted).
"""
import json
from pathlib import Path

import lab.adapters as adapters_mod
from lab.inference import build_inference_request
from lab.runtime import executor_run_once, missing_evidence, queue_add
from lab.store import connect, get

FIXTURES = Path(__file__).parent / "fixtures" / "evidence-complete"
INFERENCE_OBLIGATION = ["output_hash", "schema_hash"]


def _load(name):
    return json.loads((FIXTURES / name).read_text())


def test_complete_fixture_satisfies_the_obligation():
    assert missing_evidence(INFERENCE_OBLIGATION, _load("inference-complete.json")) == []


def test_executor_closes_fechado_with_evidence_present(monkeypatch):
    db = connect(":memory:")
    req = build_inference_request(db, "summarize", model_id="claude-opus-4-8", schema_id="summary.v1")
    fixture = _load("inference-complete.json")
    monkeypatch.setitem(adapters_mod.REGISTRY, "inference", lambda source, item: fixture)
    queue_add(db, req["id"], "inference.v1", adapter="inference")

    closed = executor_run_once(db)
    result = get(db, closed["result_hash"])
    assert result["status"] == "fechado"
    assert result["output_hash"] == fixture["output_hash"]
    assert result["schema_hash"] == fixture["schema_hash"]


def test_real_inference_adapter_also_closes_clean():
    # Not just the fixture: the real dry-run adapter emits both obligation fields.
    db = connect(":memory:")
    req = build_inference_request(db, "summarize", model_id="claude-opus-4-8", schema_id="summary.v1")
    queue_add(db, req["id"], "inference.v1", adapter="inference")
    result = get(db, executor_run_once(db)["result_hash"])
    assert result["status"] == "fechado"
    assert result["output_hash"] and result["schema_hash"]
