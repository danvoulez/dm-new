"""Regressions for the contract loader.

Every case here was a real silent failure: the loader dropped part of a contract
without complaining, and the runtime then enforced a law that was missing clauses.
"""
from __future__ import annotations

import pytest

from lab.contracts import CONTRACT_GLOB, load_catalog, load_contract
from lab.evaluator import evaluate

SLOTS_LINE = "  required_slots: [who, did, this, when, confirmed_by, if_ok, if_doubt, if_not, status]"


def _write(tmp_path, name, body):
    path = tmp_path / name
    path.write_text(body, encoding="utf-8")
    return path


def test_block_sequence_items_are_not_dropped(tmp_path):
    """The fail-open: block-style lists silently became empty tuples."""
    path = _write(tmp_path, "mixed.v1.yml", f"""process_id: mixed.v1
status: active
activation:
{SLOTS_LINE}
  must_include:
    - patient_id
    - consent_hash
adapters:
  - receipt
danger_tier: L1
""")
    contract = load_contract(path)
    assert contract.must_include == ("patient_id", "consent_hash")
    assert contract.adapters == ("receipt",)


def test_act_missing_block_declared_fields_does_not_activate(tmp_path):
    """The consequence of the fail-open, stated as behaviour.

    A contract declaring two required fields in block YAML used to lose both, so an
    act carrying neither read as complete and activated. It must be doubted instead.
    """
    path = _write(tmp_path, "mixed.v1.yml", f"""process_id: mixed.v1
status: active
activation:
{SLOTS_LINE}
  must_include:
    - patient_id
    - consent_hash
adapters: [receipt]
danger_tier: L1
""")
    catalog = {"mixed.v1": load_contract(path)}
    receipt = {
        "who": "dan", "did": "admit", "this": "patient", "when": "2026-08-12T00:00:00Z",
        "confirmed_by": "dan", "if_ok": "mixed.v1", "if_doubt": "attention-raise.v1",
        "if_not": "stop", "status": "registered", "process_id": "mixed.v1",
    }
    decision = evaluate(receipt, "mixed.v1", catalog)
    assert decision["activate"] is False
    assert decision["reason"] == "incomplete"
    assert decision["missing_aux"] == ["patient_id", "consent_hash"]


def test_trailing_comment_is_stripped(tmp_path):
    path = _write(tmp_path, "commented.v1.yml", f"""process_id: commented.v1
status: active   # a process everyone thought was active
activation:
{SLOTS_LINE}
  must_include: []
adapters: [receipt]   # the only registered leaf
danger_tier: L1
""")
    contract = load_contract(path)
    assert contract.status == "active"
    assert contract.adapters == ("receipt",)


def test_hash_inside_a_quoted_value_is_not_a_comment(tmp_path):
    path = _write(tmp_path, "hashy.v1.yml", f"""process_id: hashy.v1
status: active
title: "release #42"
activation:
{SLOTS_LINE}
adapters: [receipt]
""")
    assert load_contract(path).title == "release #42"


def test_unparsed_line_raises_instead_of_being_swallowed(tmp_path):
    """The class of bug, not just the instance: never drop a line in silence."""
    path = _write(tmp_path, "weird.v1.yml", f"""process_id: weird.v1
status: active
activation:
{SLOTS_LINE}
adapters: [receipt]
this line has no colon and no meaning
""")
    with pytest.raises(ValueError, match="unparsed line"):
        load_contract(path)


def test_catalog_loads_versions_beyond_v1(tmp_path):
    """A ``.v2`` contract was invisible to the entire runtime."""
    for version in ("v1", "v2"):
        _write(tmp_path, f"note.{version}.yml", f"""process_id: note.{version}
status: active
activation:
{SLOTS_LINE}
adapters: [receipt]
""")
    catalog = load_catalog(tmp_path)
    assert set(catalog) == {"note.v1", "note.v2"}


def test_contract_template_is_not_loaded_as_a_contract(tmp_path):
    _write(tmp_path, "PROCESS_CONTRACT_TEMPLATE.yml", "process_id: example.v1\nstatus: active\n")
    _write(tmp_path, "real.v1.yml", f"""process_id: real.v1
status: active
activation:
{SLOTS_LINE}
adapters: [receipt]
""")
    assert set(load_catalog(tmp_path)) == {"real.v1"}
    assert CONTRACT_GLOB == "*.v*.yml"


def test_shipped_catalog_still_parses():
    catalog = load_catalog()
    assert "memory-register.v1" in catalog
    assert catalog["projection-build.v1"].evidence_must_include == ("projection_hashes",)


def _semantic_contract(slot_body: str) -> str:
    return f"""process_id: semantic.v1
status: active
activation_ritual:
  slots:
{slot_body}
"""


def test_compact_required_slots_are_marked_as_compatibility_rules(tmp_path):
    path = _write(tmp_path, "compact.v1.yml", f"""process_id: compact.v1
status: active
activation_ritual:
{SLOTS_LINE}
""")

    contract = load_contract(path)

    assert contract.activation_rules_explicit is False
    assert contract.slot_rules["who"].predicate == "who.present"
    assert contract.slot_rules["when"].predicate == "when.present"


@pytest.mark.parametrize(
    ("slot_body", "message"),
    [
        (
            """    who:
      meaning: autoridade
      source: browser
      predicate: who.authorized""",
            "unknown slot source",
        ),
        (
            """    who:
      meaning: autoridade
      source: session
      predicate:""",
            "empty slot predicate",
        ),
        (
            """    surprise:
      meaning: campo estranho
      source: llm
      predicate: surprise.present""",
            "unknown activation slot",
        ),
        (
            """    who:
      meaning: autoridade
      source: session
      predicate: who.authorized
      values: request_projection""",
            "slot values must be a list",
        ),
    ],
)
def test_invalid_semantic_slot_rule_fails_closed(tmp_path, slot_body, message):
    path = _write(tmp_path, "semantic.v1.yml", _semantic_contract(slot_body))

    with pytest.raises(ValueError, match=message):
        load_contract(path)


def test_explicit_activation_ritual_requires_all_nine_slots(tmp_path):
    path = _write(
        tmp_path,
        "semantic.v1.yml",
        _semantic_contract(
            """    who:
      meaning: autoridade
      source: session
      predicate: who.authorized"""
        ),
    )

    with pytest.raises(ValueError, match="explicit activation ritual must define all nine slots"):
        load_contract(path)


def test_contract_template_compact_slot_maps_are_executable_schema():
    contract = load_contract("processes/PROCESS_CONTRACT_TEMPLATE.yml")

    assert contract.activation_rules_explicit is True
    assert contract.slot_rules["did"].values == ("example_act",)
    assert contract.slot_rules["when"].source == "clock"
