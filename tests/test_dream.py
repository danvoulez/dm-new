import json
import os
import subprocess
import sys

import pytest

from lab.dream import ingest_corpus, load_examples, load_schemas, propose_question, register_candidate, validate_payload, verify_dream_machine
from lab.errors import LabError
from lab.store import connect, get


def valid_dream_answer():
    return {
        "question": "What should move next?",
        "answer": "Register this as candidate material only.",
        "confidence": 0.78,
        "evidence": [{"ref": "chunk:abc", "summary": "Candidate evidence chunk."}],
        "contradictions": [],
        "unknowns": ["human decision"],
        "actions": ["Register candidate for attention."],
        "candidate_artifacts": [],
    }


def test_dream_machine_pack_examples_validate_and_reject_as_declared():
    result = verify_dream_machine()
    assert result["ok"], result
    assert result["examples"] == 8
    assert result["valid_examples"] == 4
    assert result["invalid_examples"] == 4
    assert result["missing_files"] == []
    assert result["missing_schemas"] == []
    assert result["failures"] == []


def test_dream_claim_without_evidence_is_rejected_by_invariant():
    schemas = load_schemas()
    errors = validate_payload(
        "claim",
        {
            "claim_id": "claim:test",
            "subject": "subject",
            "predicate": "predicate",
            "object": "object",
            "modality": "claimed",
            "confidence": 0.5,
            "source_chunks": [],
        },
        schemas,
    )
    assert any("INV-3" in error or "fewer than 1" in error for error in errors)


def test_dream_canonical_map_cannot_claim_truth_without_admitted_act():
    schemas = load_schemas()
    errors = validate_payload(
        "canonical_map",
        {
            "topic": "gate",
            "generated_at": "2026-06-22T00:00:00Z",
            "canonicality": {"status": "canonical", "confidence": 0.9, "primary_sources": ["chunk:abc"]},
            "evidence": [{"ref": "chunk:abc", "summary": "material only"}],
            "contradictions": [],
            "unknowns": [],
            "recommended_action": "register an admitted Act before upgrading",
        },
        schemas,
    )
    assert any("INV-5" in error for error in errors)


def test_dream_example_loader_maps_all_schema_cases():
    cases = load_examples()
    assert {case.schema_name for case in cases} == {"canonical_map", "claim", "dream_answer", "source_manifest"}


def test_dream_register_candidate_writes_candidate_act_without_activation():
    db = connect(":memory:")
    schemas = load_schemas()
    payload = valid_dream_answer()

    receipt = register_candidate(db, "dream_answer", payload, schemas=schemas)
    stored = get(db, receipt["id"])

    assert stored["did"] == "dream.candidate"
    assert stored["status"] == "candidate"
    assert stored["if_ok"] == "attention-raise.v1"
    assert stored["schema_name"] == "dream_answer"
    assert stored["dream_payload_hash"]
    assert stored["external_effect"] is False
    assert stored["activates_process"] is False


def test_dream_register_candidate_rejects_invalid_payload():
    db = connect(":memory:")
    schemas = load_schemas()

    with pytest.raises(LabError, match="Dream payload invalid"):
        register_candidate(
            db,
            "claim",
            {
                "claim_id": "claim:test",
                "subject": "subject",
                "predicate": "predicate",
                "object": "object",
                "modality": "claimed",
                "confidence": 0.5,
                "source_chunks": [],
            },
            schemas=schemas,
        )


def test_dream_ingest_writes_candidate_material_manifest(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    source = corpus / "note.txt"
    source.write_text("candidate material\n")
    db = connect(":memory:")

    receipt = ingest_corpus(db, corpus)
    stored = get(db, receipt["id"])

    assert stored["did"] == "dream.ingest"
    assert stored["status"] == "candidate"
    assert stored["if_ok"] == "attention-raise.v1"
    assert stored["material_id"].startswith("material:")
    assert stored["corpus_manifest"]["files"][0]["path"] == "note.txt"
    assert stored["external_effect"] is False
    assert stored["activates_process"] is False


def test_dream_propose_writes_candidate_proposal_without_final_answer():
    db = connect(":memory:")

    receipt = propose_question(db, "What should move next?")
    stored = get(db, receipt["id"])

    assert stored["did"] == "dream.proposal"
    assert stored["status"] == "candidate"
    assert stored["question"] == "What should move next?"
    assert stored["answer"] is None
    assert stored["unknowns"]
    assert stored["external_effect"] is False
    assert stored["activates_process"] is False


def test_dream_cli_register_candidate(tmp_path):
    db_path = tmp_path / "lab.sqlite"
    payload_path = tmp_path / "dream_answer.json"
    payload_path.write_text(json.dumps(valid_dream_answer()))
    env = os.environ | {"LAB_DB": str(db_path)}
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "lab.cli",
            "dream",
            "register-candidate",
            str(payload_path),
            "--schema",
            "dream_answer",
        ],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    receipt = json.loads(proc.stdout)

    assert receipt["did"] == "dream.candidate"
    assert receipt["status"] == "candidate"
    assert receipt["external_effect"] is False


def test_dream_cli_ingest_and_propose(tmp_path):
    db_path = tmp_path / "lab.sqlite"
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "note.txt").write_text("candidate material\n")
    env = os.environ | {"LAB_DB": str(db_path)}

    ingest = subprocess.run(
        [sys.executable, "-m", "lab.cli", "dream", "ingest", str(corpus)],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    propose = subprocess.run(
        [sys.executable, "-m", "lab.cli", "dream", "propose", "What should move next?"],
        cwd=os.getcwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    ingest_receipt = json.loads(ingest.stdout)
    proposal_receipt = json.loads(propose.stdout)

    assert ingest_receipt["did"] == "dream.ingest"
    assert ingest_receipt["external_effect"] is False
    assert proposal_receipt["did"] == "dream.proposal"
    assert proposal_receipt["answer"] is None
