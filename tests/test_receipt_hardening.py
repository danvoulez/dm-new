"""Receipt hardening for historical v0 and canonical product v1 identity.

The Foundation fixture corpus remains a frozen v0 compatibility proof. New product
receipts use v1 and pin the v1.2 split between semantic content and process envelope.
"""
import json
import re
from pathlib import Path

import pytest

from lab.errors import ReceiptError
from lab.receipt import (
    HASH_FIELDS_V0,
    HASH_FIELDS_V1,
    mint,
    mint_v0,
    sha256_text,
    canonical_json,
    verify,
    verify_or_raise,
)

CONFORMANCE = Path(__file__).parent / "fixtures" / "logline-foundation" / "conformance"
RECEIPT_FIXTURE = CONFORMANCE / "fixtures" / "receipt.valid.json"
VECTORS = CONFORMANCE / "vectors" / "receipt"
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _is_envelope(vector):
    return "content" in vector and "transport" in vector


def _load_vectors(kind):
    return sorted((VECTORS / kind).glob("*.json"))


VALID_VECTORS = _load_vectors("valid")
INVALID_VECTORS = _load_vectors("invalid")


def _base(**extra):
    base = dict(
        who="dan", did="rested", this="slept_well", when="2026-05-17T07:30:00Z",
        confirmed_by="dan", if_ok="continue_minilab_work", if_doubt="", if_not="",
        status="claimed",
    )
    base.update(extra)
    return base


# ---------------------------------------------------------------- historical v0

def test_v0_golden_fixture_verifies_and_reproduces_embedded_digests():
    fixture = json.loads(RECEIPT_FIXTURE.read_text())
    assert verify(fixture) == (True, "ok")
    minted = mint_v0({k: v for k, v in fixture.items() if k not in {"id", "hashes"}})
    assert minted["id"] == fixture["id"]
    assert minted["hashes"]["content_hash"] == fixture["hashes"]["content_hash"]
    assert minted["hashes"]["tuple_hash"] == fixture["hashes"]["tuple_hash"]
    assert set(minted["hashes"]) == HASH_FIELDS_V0


def test_v0_frozen_vector_stays_exact():
    r = mint_v0(_base())
    assert r["hashes"]["tuple_hash"] == "6ace2eed03aa73839414db1d76a3bf08880d8ae50f5db81405c85f2b269ef1ee"
    assert r["hashes"]["content_hash"] == "b74954069c9135090740439e08bdd442b4b12767c4df63b504c3e6b1029ffbb8"
    assert r["receipt_version"] == "logline.receipt.v0"


@pytest.mark.parametrize("path", VALID_VECTORS, ids=lambda p: p.name)
def test_historical_valid_vectors_still_verify(path):
    vector = json.loads(path.read_text())
    if _is_envelope(vector):
        assert verify(vector["content"]) == (True, "ok")
        return
    assert verify(vector)[0], path.name


@pytest.mark.parametrize("path", INVALID_VECTORS, ids=lambda p: p.name)
def test_historical_invalid_vectors_still_reject(path):
    vector = json.loads(path.read_text())
    if _is_envelope(vector):
        assert verify(vector["content"]) == (True, "ok")
        return
    assert verify(vector)[0] is False, path.name


# ---------------------------------------------------------------- canonical v1

def test_v1_hash_law_is_exact():
    envelope = {"process": "a" * 64, "parent": "b" * 64, "channel": "chat"}
    r = mint(_base(envelope=envelope))
    content = _base()
    expected_content = sha256_text(canonical_json(content))
    expected_envelope = sha256_text(canonical_json(envelope))
    expected_tuple = sha256_text(expected_content + expected_envelope)
    assert r["receipt_version"] == "logline.receipt.v1"
    assert r["id"] == expected_content == r["hashes"]["content_hash"]
    assert r["hashes"]["envelope_hash"] == expected_envelope
    assert r["hashes"]["tuple_hash"] == expected_tuple
    assert set(r["hashes"]) == HASH_FIELDS_V1
    verify_or_raise(r)


def test_envelope_changes_context_identity_not_content_identity():
    bare = mint(_base(envelope={}))
    routed = mint(_base(envelope={"process": "a" * 64, "channel": "chat"}))
    assert routed["hashes"]["content_hash"] == bare["hashes"]["content_hash"]
    assert routed["hashes"]["envelope_hash"] != bare["hashes"]["envelope_hash"]
    assert routed["hashes"]["tuple_hash"] != bare["hashes"]["tuple_hash"]


def test_aux_changes_content_identity_but_not_same_envelope_hash():
    bare = mint(_base(envelope={}))
    with_aux = mint(_base(process_id="memory-register.v1", envelope={}))
    assert with_aux["hashes"]["content_hash"] != bare["hashes"]["content_hash"]
    assert with_aux["hashes"]["envelope_hash"] == bare["hashes"]["envelope_hash"]
    assert with_aux["hashes"]["tuple_hash"] != bare["hashes"]["tuple_hash"]


def test_receipt_metadata_is_not_content_hash_material():
    r = mint(_base(envelope={}))
    semantic = {k: v for k, v in r.items() if k not in {"id", "hashes", "receipt_version", "json_canonicalization", "envelope"}}
    assert sha256_text(canonical_json(semantic)) == r["hashes"]["content_hash"]


def test_v1_hashes_object_is_closed_and_requires_envelope_hash():
    r = mint(_base(envelope={}))
    tampered = dict(r)
    tampered["hashes"] = {**r["hashes"], "extra": "0" * 64}
    ok, msg = verify(tampered)
    assert not ok and "forbidden field" in msg

    missing = dict(r)
    missing["hashes"] = {k: v for k, v in r["hashes"].items() if k != "envelope_hash"}
    ok, msg = verify(missing)
    assert not ok and "missing field" in msg


@pytest.mark.parametrize("field", ["result", "evidence", "transport"])
def test_forbidden_top_level_fields_rejected_at_mint(field):
    with pytest.raises(ReceiptError, match="forbidden"):
        mint(_base(**{field: {}}))


def test_envelope_must_be_object():
    with pytest.raises(ReceiptError, match="envelope"):
        mint(_base(envelope="not-an-object"))


def test_hash_outputs_are_bare_lowercase_hex64():
    r = mint(_base(envelope={}))
    for value in (
        r["id"],
        r["hashes"]["tuple_hash"],
        r["hashes"]["content_hash"],
        r["hashes"]["envelope_hash"],
    ):
        assert HEX64.match(value)


def test_mint_is_insertion_order_independent():
    forward = mint(_base(envelope={}))
    reversed_input = dict(reversed(list(_base(envelope={}).items())))
    assert mint(reversed_input)["id"] == forward["id"]
    assert mint(reversed_input)["hashes"]["tuple_hash"] == forward["hashes"]["tuple_hash"]


def test_mint_is_idempotent():
    assert mint(_base(envelope={}))["hashes"] == mint(_base(envelope={}))["hashes"]


@pytest.mark.parametrize("slot", ["who", "did", "this", "status"])
def test_any_slot_mutation_is_detected(slot):
    r = mint(_base(envelope={}))
    tampered = dict(r)
    tampered[slot] = tampered[slot] + "_x"
    assert verify(tampered)[0] is False


def test_envelope_mutation_is_detected():
    r = mint(_base(envelope={"channel": "chat"}))
    tampered = dict(r)
    tampered["envelope"] = {"channel": "email"}
    assert verify(tampered)[0] is False
