"""Day 2 §15 — evidence_incomplete is a first-class state.

When an adapter returns a result that does not carry the contract's declared
``evidence_must_include`` fields, the executor writes a durable ``evidence_incomplete``
doubt — never a fake ``fechado``. Driven by canonical fixtures of adapter output.
"""
import json
from pathlib import Path

import pytest

import lab.adapters as adapters_mod
from lab.inference import build_inference_request
from lab.runtime import executor_run_once, missing_evidence, queue_add
from lab.store import connect, get

FIXTURES = Path(__file__).parent / "fixtures" / "evidence-incomplete"
INFERENCE_OBLIGATION = ["output_hash", "schema_hash"]


def _load(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.mark.parametrize("name,missing", [
    ("inference-missing-output-hash.json", "output_hash"),
    ("inference-missing-schema-hash.json", "schema_hash"),
])
def test_missing_evidence_flags_the_absent_field(name, missing):
    assert missing_evidence(INFERENCE_OBLIGATION, _load(name)) == [missing]


@pytest.mark.parametrize("name,missing", [
    ("inference-missing-output-hash.json", "output_hash"),
    ("inference-missing-schema-hash.json", "schema_hash"),
])
def test_executor_writes_evidence_incomplete_not_fechado(name, missing, monkeypatch):
    db = connect(":memory:")
    req = build_inference_request(db, "summarize", model_id="claude-opus-4-8", schema_id="summary.v1")
    fixture = _load(name)
    monkeypatch.setitem(adapters_mod.REGISTRY, "inference", lambda source, item: fixture)
    queue_add(db, req["id"], "inference.v1", adapter="inference")

    closed = executor_run_once(db)
    result = get(db, closed["result_hash"])
    assert closed["status"] == "closed"            # queue resolved, not dangling
    assert result["status"] == "doubted"           # not a fake close
    assert result["did"] == "evidence_incomplete"
    assert result["reason"] == "evidence_obligation_unmet"
    assert result["missing_evidence"] == [missing]
