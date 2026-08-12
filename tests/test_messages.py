"""The message catalog must stay exhaustive against the runtime's failure vocabulary.

This is the test that keeps the promise "never a generic error". If someone adds a
doubt reason to the runtime without writing the sentence a person reads, this fails.
"""
from __future__ import annotations

import pytest

from lab.messages import CATALOG, OPERATOR, USER, catalog, render
from lab.runtime import DOUBT_REASONS


def test_every_runtime_doubt_reason_has_a_message():
    missing = sorted(DOUBT_REASONS - set(CATALOG))
    assert not missing, f"doubt reasons with no human message: {missing}"


def test_catalog_has_no_message_for_a_reason_the_runtime_cannot_emit():
    extra = sorted(set(CATALOG) - DOUBT_REASONS)
    assert not extra, f"messages for reasons the runtime never emits: {extra}"


def test_every_entry_names_who_can_resolve_it():
    for code, (_, _, resolved_by) in CATALOG.items():
        assert resolved_by in {USER, OPERATOR}, code


def test_no_message_leaks_the_code_or_backend_vocabulary():
    leaks = ("adapter", "grant_", "content_hash", "if_ok", "receipt", "queue", "doubt")
    for code, (template, _, _) in CATALOG.items():
        lowered = template.lower()
        for leak in leaks:
            assert leak not in lowered, f"{code} leaks {leak!r}: {template}"


def test_incomplete_names_the_missing_fields():
    rendered = render("incomplete", {"missing_aux": ["motivo_da_auditoria"]})
    assert rendered["message"] == "Para andar, falta: motivo_da_auditoria."
    assert rendered["action"] == "Completar"
    assert rendered["resolved_by"] == USER


def test_several_missing_fields_read_like_a_sentence():
    rendered = render("incomplete", {"missing_aux": ["a", "b", "c"]})
    assert rendered["message"] == "Para andar, falta: a, b e c."


def test_evidence_gap_names_what_was_not_proven():
    rendered = render("evidence_obligation_unmet", {"missing_evidence": ["text_hash"]})
    assert "text_hash" in rendered["message"]
    assert rendered["resolved_by"] == OPERATOR


def test_adapter_rejection_carries_the_reason():
    rendered = render("adapter_rejected", {"adapter_error": "schema-invalid: faltou summary"})
    assert "schema-invalid" in rendered["message"]


def test_unknown_reason_degrades_honestly():
    rendered = render("something_new_nobody_wrote_yet")
    assert rendered["known"] is False
    assert rendered["resolved_by"] == OPERATOR


@pytest.mark.parametrize("code", sorted(CATALOG))
def test_every_template_renders_without_a_receipt(code):
    """A doubt receipt may be missing any aux field; rendering must never raise."""
    rendered = render(code)
    assert rendered["message"]
    assert "{" not in rendered["message"]


def test_catalog_export_is_sorted_and_complete():
    exported = catalog()
    assert len(exported) == len(CATALOG)
    assert [entry["code"] for entry in exported] == sorted(CATALOG)
