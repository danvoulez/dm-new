"""Citation composition profile under receipt v1 identity.

A content-hash citation binds the semantic Act (9+AUX) independent of envelope.
A tuple-hash citation binds that semantic Act in its exact envelope/context.
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
        status="claimed", envelope={},
    )
    base.update(extra)
    return base


def _cited_with_aux():
    return mint(_base(
        process_contract_hash="a" * 64,
        result_hash="b" * 64,
    ))


def test_content_hash_citation_binds_semantic_identity():
    cited = mint(_base())
    citation = make_citation(cited, "content_hash")
    assert citation["kind"] == "content_hash"
    assert citation["cited_hash"] == cited["hashes"]["content_hash"] == cited["id"]
    validate_citation(citation, cited)


def test_tuple_hash_citation_binds_content_plus_envelope():
    cited = mint(_base(envelope={"channel": "chat"}))
    citation = make_citation(cited, "tuple_hash")
    assert citation["cited_hash"] == cited["hashes"]["tuple_hash"]
    validate_citation(citation, cited)


def test_content_hash_survives_envelope_change_but_tuple_hash_does_not():
    cited = mint(_base(envelope={"channel": "chat"}))
    same_content_new_context = mint(_base(envelope={"channel": "email"}))
    content_cite = make_citation(cited, "content_hash")
    tuple_cite = make_citation(cited, "tuple_hash")
    validate_citation(content_cite, same_content_new_context)
    with pytest.raises(ReceiptError, match="tuple_hash mismatch"):
        validate_citation(tuple_cite, same_content_new_context)


def test_both_content_and_tuple_hash_change_when_aux_changes():
    cited = mint(_base())
    cited_more_aux = mint(_base(note="not incidental to semantic identity"))
    content_cite = make_citation(cited, "content_hash")
    tuple_cite = make_citation(cited, "tuple_hash")
    with pytest.raises(ReceiptError, match="content_hash mismatch"):
        validate_citation(content_cite, cited_more_aux)
    with pytest.raises(ReceiptError, match="tuple_hash mismatch"):
        validate_citation(tuple_cite, cited_more_aux)


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
    cited = mint(_base())
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
    b = mint(_base(this="b", envelope={"channel": "chat"}))
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


def test_citation_is_additive_aux_and_does_not_touch_slots():
    cited = mint(_base())
    input_fields = _base(who="auditor", did="cited", this=cited["id"])
    citing = cite(input_fields, cited, "content_hash")
    assert {slot: citing[slot] for slot in SLOTS} == {slot: input_fields[slot] for slot in SLOTS}
    assert citing["citation"]["kind"] == "content_hash"
    assert verify(citing) == (True, "ok")
    validate_citation(citing["citation"], cited)


def test_cite_binds_citation_into_citing_content_hash():
    cited = mint(_base())
    citing = cite(_base(did="cited"), cited)
    tampered = dict(citing)
    tampered["citation"] = {**citing["citation"], "cited_hash": "0" * 64}
    assert verify(tampered)[0] is False


def test_cite_rejects_preexisting_citation():
    cited = mint(_base())
    with pytest.raises(ReceiptError, match="already carry a citation"):
        cite({**_base(), "citation": {}}, cited)


def test_flipped_cited_hash_is_detected():
    cited = mint(_base())
    citation = dict(make_citation(cited, "content_hash"))
    citation["cited_hash"] = "0" * 64
    with pytest.raises(ReceiptError, match="content_hash mismatch"):
        validate_citation(citation, cited)


def test_swapped_kind_is_detected():
    cited = mint(_base(envelope={"channel": "chat"}))
    citation = make_citation(cited, "tuple_hash")
    forged = {**citation, "kind": "content_hash"}
    with pytest.raises(ReceiptError, match="content_hash mismatch"):
        validate_citation(forged, cited)


def test_tampered_cited_receipt_is_detected():
    cited = mint(_base())
    citation = make_citation(cited, "content_hash")
    tampered_cited = dict(cited)
    tampered_cited["status"] = "claimed_x"
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
    forward = bundle_hash([{"kind": "content_hash", "hash": a["id"]}, {"kind": "content_hash", "hash": b["id"]}])
    reversed_ = bundle_hash([{"kind": "content_hash", "hash": b["id"]}, {"kind": "content_hash", "hash": a["id"]}])
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
