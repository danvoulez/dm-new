"""Receipt-level hardening: parity vectors + LIP-0007 composition profile.

`test_jcs_conformance.py` pins the canonicalizer byte-for-byte. This file pins the
layer above it — receipt *identity* — which the round-trip tests in `test_receipt.py`
cannot catch: a silent change to SLOTS order, RECEIPT_VERSION, the content/tuple split,
or the closed `hashes` shape would still mint-and-verify cleanly while breaking
cross-implementation parity. Three guarantees, each frozen here:

  * PARITY   — `lab.receipt` reproduces the exact digests the conformance fixtures and
               the JS gate (`verify-receipt.mjs`) carry. The fixture file is the shared
               golden vector; this binds the Python authority side to it.
  * COMPOSITION — every rule in conformance/cases/receipt-cases.json (LIP-0007) holds:
               tuple/content split, AUX behaviour, closed hashes object, forbidden
               fields, hex shape, dotted version.
  * DETERMINISM — canonicalization makes mint insertion-order-independent and idempotent,
               and any post-mint mutation is detected.

If a LIP-0007 rule is added to the spec without coverage here, COVERED_CASE_IDS guards it.
"""
import json
import re
from pathlib import Path

import pytest

from lab.errors import ReceiptError
from lab.receipt import HASH_FIELDS, mint, verify, verify_or_raise

CONFORMANCE = Path(__file__).parent / "fixtures" / "logline-foundation" / "conformance"
RECEIPT_FIXTURE = CONFORMANCE / "fixtures" / "receipt.valid.json"
RECEIPT_CASES = CONFORMANCE / "cases" / "receipt-cases.json"
VECTORS = CONFORMANCE / "vectors" / "receipt"

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _is_envelope(vector):
    """Envelope-shaped vectors wrap a receipt in {content, transport, envelope_hash}.
    Envelope-layer validity belongs to the Envelope validator's jurisdiction, not the
    receipt authority — so `lab.receipt.verify` neither accepts nor judges them."""
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


# --------------------------------------------------------------------------- PARITY

def test_golden_fixture_verifies_and_reproduces_embedded_digests():
    """The shared conformance fixture is THE parity vector: Python must verify it and
    re-mint its exact tuple_hash / content_hash / id. If these drift, Python no longer
    agrees byte-for-byte with the JS gate that signs the same fixture."""
    fixture = json.loads(RECEIPT_FIXTURE.read_text())
    assert verify(fixture) == (True, "ok")
    minted = mint({k: v for k, v in fixture.items() if k not in {"id", "hashes"}})
    assert minted["id"] == fixture["id"]
    assert minted["hashes"]["content_hash"] == fixture["hashes"]["content_hash"]
    assert minted["hashes"]["tuple_hash"] == fixture["hashes"]["tuple_hash"]


def test_frozen_vector_minimal():
    """Independent in-repo golden digest for a no-AUX receipt. Hardcoded so a refactor
    that changes the canonical bytes fails loudly rather than silently re-identifying."""
    r = mint(_base())
    assert r["hashes"]["tuple_hash"] == "6ace2eed03aa73839414db1d76a3bf08880d8ae50f5db81405c85f2b269ef1ee"
    assert r["hashes"]["content_hash"] == "b74954069c9135090740439e08bdd442b4b12767c4df63b504c3e6b1029ffbb8"
    assert r["id"] == r["hashes"]["content_hash"]


def test_frozen_vector_with_aux():
    """Golden digest pinning the AUX-in-content-hash path to a literal."""
    r = mint(dict(
        who="dan", did="registered", this="memory", when="2026-06-26T00:00:00Z",
        confirmed_by="dan", if_ok="memory-register.v1", if_doubt="attention-raise.v1",
        if_not="stop", status="registered", process_id="memory-register.v1",
    ))
    assert r["hashes"]["tuple_hash"] == "4879991f76a392f7e4e44d7de42d89253469ce25fc81fd31a4f5f1784550bc65"
    assert r["hashes"]["content_hash"] == "5a960f80f745d3fbef747f0ab3c5b95719222d299a1c3fb9a47686fa6c2595b2"
    assert r["id"] == r["hashes"]["content_hash"]


# ------------------------------------------------------------ CROSS-ENGINE PARITY

# The conformance vector corpus under vectors/receipt/{valid,invalid} is the SAME set
# the JS reference gate (tools/verify-receipt.mjs --suite) runs. Running it through the
# Python authority and demanding identical verdicts is the actual byte-for-byte parity
# proof the receipt module's docstring promises ("must agree with the Rust/JS gate").


def test_vector_corpus_is_present_and_nonvacuous():
    assert len(VALID_VECTORS) >= 8, "valid receipt vector corpus shrank unexpectedly"
    assert len(INVALID_VECTORS) >= 10, "invalid receipt vector corpus shrank unexpectedly"


@pytest.mark.parametrize("path", VALID_VECTORS, ids=lambda p: p.name)
def test_valid_vectors_match_js_gate(path):
    vector = json.loads(path.read_text())
    if _is_envelope(vector):
        # Out of scope for the receipt authority, but the receipt it carries must verify:
        # the membrane crossing is the Envelope validator's call, the payload is ours.
        assert verify(vector["content"]) == (True, "ok")
        return
    ok, msg = verify(vector)
    assert ok, f"{path.name} should verify but failed: {msg}"


@pytest.mark.parametrize("path", INVALID_VECTORS, ids=lambda p: p.name)
def test_invalid_vectors_are_rejected_like_js_gate(path):
    vector = json.loads(path.read_text())
    if _is_envelope(vector):
        # Envelope-layer invalidity (e.g. envelope_hash mismatch) is not the receipt
        # authority's jurisdiction; we only assert the embedded receipt is well-formed,
        # so the rejection provably comes from the Envelope layer, not a malformed payload.
        assert verify(vector["content"]) == (True, "ok")
        return
    ok, _ = verify(vector)
    assert not ok, f"{path.name} should be rejected but verified"


# ---------------------------------------------------------------------- COMPOSITION

def test_aux_changes_content_hash_preserves_tuple_hash():
    """LIP-0007 aux-included-in-content-hash: an AUX field is bound into identity
    (content_hash) but the 9-slot tuple_hash is invariant under it."""
    bare = mint(_base())
    with_aux = mint(_base(process_id="memory-register.v1"))
    assert with_aux["hashes"]["tuple_hash"] == bare["hashes"]["tuple_hash"]
    assert with_aux["hashes"]["content_hash"] != bare["hashes"]["content_hash"]


def test_id_equals_content_hash():
    assert mint(_base())["id"] == mint(_base())["hashes"]["content_hash"]


def test_hashes_object_is_closed():
    """LIP-0007 hashes-no-extra-fields / envelope-hash-not-in-receipt: the hashes object
    carries exactly {tuple_hash, content_hash, algorithm}, and the authority side rejects
    any smuggled extra key (e.g. an envelope_hash masquerading as receipt identity)."""
    r = mint(_base())
    assert set(r["hashes"]) == HASH_FIELDS == {"tuple_hash", "content_hash", "algorithm"}
    tampered = dict(r)
    tampered["hashes"] = {**r["hashes"], "envelope_hash": "0" * 64}
    ok, msg = verify(tampered)
    assert not ok
    assert "forbidden field" in msg and "envelope_hash" in msg


@pytest.mark.parametrize("field", ["result", "evidence", "transport"])
def test_forbidden_top_level_fields_rejected_at_mint(field):
    with pytest.raises(ReceiptError, match="forbidden"):
        mint(_base(**{field: {}}))


def test_hash_outputs_are_bare_lowercase_hex64():
    r = mint(_base())
    for value in (r["id"], r["hashes"]["tuple_hash"], r["hashes"]["content_hash"]):
        assert HEX64.match(value)


def test_receipt_version_uses_dots():
    assert mint(_base())["receipt_version"] == "logline.receipt.v0"


# ---------------------------------------------------------------------- DETERMINISM

def test_mint_is_insertion_order_independent():
    """Canonicalization, not dict order, determines identity."""
    forward = mint(_base())
    reversed_input = dict(reversed(list(_base().items())))
    assert mint(reversed_input)["id"] == forward["id"]


def test_mint_is_idempotent():
    assert mint(_base())["id"] == mint(_base())["id"]


@pytest.mark.parametrize("slot", ["who", "did", "this", "status"])
def test_any_slot_mutation_is_detected(slot):
    r = mint(_base())
    tampered = dict(r)
    tampered[slot] = tampered[slot] + "_x"
    assert verify(tampered)[0] is False


# ------------------------------------------------------------------ SPEC-DRIFT GUARD

# Every LIP-0007 case id this suite asserts behaviour for. Envelope-boundary cases are
# covered negatively (the receipt module must never emit/accept envelope_hash).
COVERED_CASE_IDS = {
    "tuple-hash-jcs", "content-hash-excludes-id-and-hashes", "id-equals-content-hash",
    "hashes-no-extra-fields", "envelope-hash-not-in-receipt", "forbidden-result",
    "forbidden-evidence", "forbidden-transport", "receipt-version-dots",
    "hash-output-bare-hex", "aux-included-in-content-hash",
    "envelope-hash-at-transport-boundary",
}


def test_no_lip0007_rule_is_left_uncovered():
    """If a new rule lands in receipt-cases.json, this fails until coverage is added —
    so the spec and the authority-side hardening cannot silently diverge."""
    spec_ids = {c["id"] for c in json.loads(RECEIPT_CASES.read_text())["cases"]}
    assert spec_ids == COVERED_CASE_IDS, (
        f"uncovered: {spec_ids - COVERED_CASE_IDS}; stale: {COVERED_CASE_IDS - spec_ids}"
    )


def test_content_hash_excludes_id_and_hashes():
    """LIP-0007 content-hash-excludes-id-and-hashes: verify re-derives identity over the
    receipt minus id+hashes, so those fields cannot influence content_hash."""
    r = mint(_base())
    # verify_or_raise re-mints from everything except id/hashes; a receipt whose id/hashes
    # were stripped and re-minted must land on the identical identity.
    re_minted = mint({k: v for k, v in r.items() if k not in {"id", "hashes"}})
    assert re_minted["id"] == r["id"]
    verify_or_raise(r)  # does not raise
