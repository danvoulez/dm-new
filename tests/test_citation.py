"""Citation composition profile (lab/citation.py).

A receipt cites another receipt by an *explicit* hash choice. These tests pin each
citation kind, prove the nine invariant slots stay untouched (citation rides as additive
AUX), and prove tamper detection — at the citation layer (validate_*) and at the citing
receipt's own content hash (receipt.verify), since the citation is bound into it.
"""
import pytest

from lab.citation import (
    BUNDLE_KIND,
    DIRECT_KINDS,
    bundle_hash,
    cite,
    make_bundle_citation,
    make_citation,
    validate_bundle_citation,
    validate_citation,
)
from lab.errors import ReceiptError
from lab.receipt import SLOTS, mint, verify


def _base(**extra):
    base = dict(
        who="dan", did="rested", this="slept_well", when="2026-05-17T07:30:00Z",
        confirmed_by="dan", if_ok="continue_minilab_work", if_doubt="", if_not="",
        status="claimed",
    )
    base.update(extra)
    return base


def _cited_with_aux():
    """A cited receipt carrying the AUX fields that the AUX-resident kinds bind to."""
    return mint(_base(
        process_contract_hash="a" * 64,
        result_hash="b" * 64,
    ))


# ----------------------------------------------------------- EACH CITATION KIND

def test_content_hash_citation_binds_full_identity():
    cited = mint(_base())
    citation = make_citation(cited, "content_hash")
    assert citation["kind"] == "content_hash"
    assert citation["cited_hash"] == cited["hashes"]["content_hash"] == cited["id"]
    validate_citation(citation, cited)  # does not raise


def test_tuple_hash_citation_binds_slots_only():
    cited = mint(_base())
    citation = make_citation(cited, "tuple_hash")
    assert citation["cited_hash"] == cited["hashes"]["tuple_hash"]
    validate_citation(citation, cited)


def test_tuple_hash_citation_survives_aux_change_but_content_hash_does_not():
    """The whole point of the tuple_hash kind: it binds the asserted act, not its AUX."""
    cited = mint(_base())
    cited_more_aux = mint(_base(note="incidental"))
    tuple_cite = make_citation(cited, "tuple_hash")
    content_cite = make_citation(cited, "content_hash")
    # tuple_hash is invariant under AUX, so the tuple citation still validates against the
    # AUX-laden re-mint; the content citation does not.
    validate_citation(tuple_cite, cited_more_aux)
    with pytest.raises(ReceiptError, match="content_hash mismatch"):
        validate_citation(content_cite, cited_more_aux)


def test_process_contract_hash_citation_reads_aux_field():
    cited = _cited_with_aux()
    citation = make_citation(cited, "process_contract_hash")
    assert citation["cited_hash"] == "a" * 64
    validate_citation(citation, cited)


def test_result_hash_citation_reads_aux_field():
    cited = _cited_with_aux()
    citation = make_citation(cited, "result_hash")
    assert citation["cited_hash"] == "b" * 64
    validate_citation(citation, cited)


def test_aux_kind_citation_fails_when_cited_lacks_the_field():
    cited = mint(_base())  # no process_contract_hash AUX
    with pytest.raises(ReceiptError, match="no process_contract_hash"):
        make_citation(cited, "process_contract_hash")


def test_bundle_citation_binds_multiple_receipts_in_order():
    a, b, c = mint(_base(this="a")), mint(_base(this="b")), mint(_base(this="c"))
    citation = make_bundle_citation([a, b, c])
    assert citation["kind"] == BUNDLE_KIND
    assert len(citation["leaves"]) == 3
    validate_bundle_citation(citation, [a, b, c])


def test_bundle_citation_supports_mixed_kinds():
    a = _cited_with_aux()
    b = mint(_base(this="b"))
    citation = make_bundle_citation([a, b], kinds=["result_hash", "tuple_hash"])
    assert [leaf["kind"] for leaf in citation["leaves"]] == ["result_hash", "tuple_hash"]
    validate_bundle_citation(citation, [a, b])


def test_unknown_kind_is_rejected():
    cited = mint(_base())
    with pytest.raises(ReceiptError, match="unknown citation kind"):
        make_citation(cited, "envelope_hash")


def test_every_direct_kind_round_trips():
    cited = _cited_with_aux()
    for kind in DIRECT_KINDS:
        validate_citation(make_citation(cited, kind), cited)


# ------------------------------------------------------------ NINE SLOTS UNTOUCHED

def test_citation_is_additive_aux_and_does_not_touch_slots():
    cited = mint(_base())
    citing = cite(_base(who="auditor", did="cited", this=cited["id"]), cited, "content_hash")
    # The citing receipt's own nine slots are exactly what we passed — citation is AUX.
    assert {slot: citing[slot] for slot in SLOTS} == {
        slot: _base(who="auditor", did="cited", this=cited["id"])[slot] for slot in SLOTS
    }
    assert citing["citation"]["kind"] == "content_hash"
    assert verify(citing) == (True, "ok")
    validate_citation(citing["citation"], cited)


def test_cite_binds_citation_into_citing_content_hash():
    """Because the citation is AUX, mutating it post-mint breaks the citing receipt's hash."""
    cited = mint(_base())
    citing = cite(_base(did="cited"), cited)
    tampered = dict(citing)
    tampered["citation"] = {**citing["citation"], "cited_hash": "0" * 64}
    ok, _ = verify(tampered)
    assert ok is False  # citing receipt no longer reproduces its own content hash


def test_cite_rejects_preexisting_citation():
    cited = mint(_base())
    with pytest.raises(ReceiptError, match="already carry a citation"):
        cite({**_base(), "citation": {}}, cited)


# ----------------------------------------------------------------- TAMPER DETECTION

def test_flipped_cited_hash_is_detected():
    cited = mint(_base())
    citation = dict(make_citation(cited, "content_hash"))
    citation["cited_hash"] = "0" * 64
    with pytest.raises(ReceiptError, match="content_hash mismatch"):
        validate_citation(citation, cited)


def test_swapped_kind_is_detected():
    """Claiming content_hash while carrying the tuple_hash value must fail."""
    cited = mint(_base())
    citation = make_citation(cited, "tuple_hash")
    forged = {**citation, "kind": "content_hash"}
    with pytest.raises(ReceiptError, match="content_hash mismatch"):
        validate_citation(forged, cited)


def test_tampered_cited_receipt_is_detected():
    cited = mint(_base())
    citation = make_citation(cited, "content_hash")
    tampered_cited = dict(cited)
    tampered_cited["status"] = "claimed_x"  # cited slot mutated, hashes now stale
    with pytest.raises(ReceiptError):
        validate_citation(citation, tampered_cited)


def test_bundle_leaf_tamper_is_detected():
    a, b = mint(_base(this="a")), mint(_base(this="b"))
    citation = make_bundle_citation([a, b])
    citation["leaves"][0]["hash"] = "0" * 64
    with pytest.raises(ReceiptError, match="bundle leaf"):
        validate_bundle_citation(citation, [a, b])


def test_bundle_reorder_changes_hash():
    a, b = mint(_base(this="a")), mint(_base(this="b"))
    forward = bundle_hash([{"kind": "content_hash", "hash": a["id"]},
                           {"kind": "content_hash", "hash": b["id"]}])
    reversed_ = bundle_hash([{"kind": "content_hash", "hash": b["id"]},
                             {"kind": "content_hash", "hash": a["id"]}])
    assert forward != reversed_


def test_bundle_forged_bundle_hash_is_detected():
    a, b = mint(_base(this="a")), mint(_base(this="b"))
    citation = make_bundle_citation([a, b])
    citation["bundle_hash"] = "0" * 64
    with pytest.raises(ReceiptError, match="bundle_hash mismatch"):
        validate_bundle_citation(citation, [a, b])


def test_bundle_wrong_cited_set_is_detected():
    a, b, c = mint(_base(this="a")), mint(_base(this="b")), mint(_base(this="c"))
    citation = make_bundle_citation([a, b])
    with pytest.raises(ReceiptError, match="bundle leaf"):
        validate_bundle_citation(citation, [a, c])


def test_validate_rejects_bundle_through_single_validator():
    a, b = mint(_base(this="a")), mint(_base(this="b"))
    citation = make_bundle_citation([a, b])
    with pytest.raises(ReceiptError, match="validate_bundle_citation"):
        validate_citation(citation, a)


def test_bad_citation_version_is_rejected():
    cited = mint(_base())
    citation = {**make_citation(cited, "content_hash"), "citation_version": "v999"}
    with pytest.raises(ReceiptError, match="citation_version"):
        validate_citation(citation, cited)
