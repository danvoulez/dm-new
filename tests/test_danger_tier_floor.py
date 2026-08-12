"""The danger tier must be derived, not merely declared.

The tier decides whether grant + passkey signoff apply. It used to be pure
declaration, so a contract naming a powerful adapter could declare ``L0`` and skip
the dangerous-work controls — making contract authorship strictly more powerful
than any grant. The adapter now carries a floor the contract cannot go under.
"""
from __future__ import annotations

from lab.adapters import ADAPTER_MIN_TIER, REGISTRY, adapter_floor, effective_danger_tier
from lab.contracts import load_contract
from lab.evaluator import evaluate

SLOTS_LINE = "  required_slots: [who, did, this, when, confirmed_by, if_ok, if_doubt, if_not, status]"


def test_every_registered_adapter_declares_a_floor():
    """A new adapter without a declared floor is exactly how the hole reopens."""
    assert set(REGISTRY) == set(ADAPTER_MIN_TIER), (
        "every adapter in REGISTRY must declare a minimum danger tier"
    )


def test_declared_tier_cannot_go_below_the_adapter_floor():
    assert effective_danger_tier("L0", "inference") == "L3"
    assert effective_danger_tier("L1", "oauth-client") == "L3"


def test_a_contract_may_raise_its_own_tier():
    assert effective_danger_tier("L5", "receipt") == "L5"
    assert effective_danger_tier("L4", "inference") == "L4"


def test_unknown_adapter_floors_at_l0():
    """Unknown adapters cannot dispatch at all, so the floor is irrelevant but defined."""
    assert adapter_floor("not-a-real-adapter") == "L0"
    assert adapter_floor(None) == "L0"


def test_low_declaration_over_a_dangerous_adapter_still_demands_a_grant(tmp_path, monkeypatch):
    monkeypatch.setitem(ADAPTER_MIN_TIER, "receipt", "L5")
    path = tmp_path / "sneaky.v1.yml"
    path.write_text(f"""process_id: sneaky.v1
status: active
activation:
{SLOTS_LINE}
adapters: [receipt]
danger_tier: L0
""", encoding="utf-8")
    catalog = {"sneaky.v1": load_contract(path)}
    receipt = {
        "who": "dan", "did": "act", "this": "thing", "when": "2026-08-12T00:00:00Z",
        "confirmed_by": "dan", "if_ok": "sneaky.v1", "if_doubt": "attention-raise.v1",
        "if_not": "stop", "status": "registered",
    }
    decision = evaluate(receipt, "sneaky.v1", catalog)
    assert decision["declared_danger_tier"] == "L0"
    assert decision["danger_tier"] == "L5"
    assert decision["activate"] is False
    assert decision["reason"] == "missing_required_grant"


def test_shipped_contracts_keep_their_effective_tiers():
    from lab.contracts import load_catalog

    catalog = load_catalog()
    receipt_base = {
        "who": "x", "did": "y", "this": "z", "when": "2026-08-12T00:00:00Z",
        "confirmed_by": "x", "if_doubt": "attention-raise.v1", "if_not": "stop",
        "status": "registered",
    }
    for process_id, expected in (("memory-register.v1", "L0"), ("projection-build.v1", "L1"), ("inference.v1", "L3")):
        decision = evaluate({**receipt_base, "if_ok": process_id}, process_id, catalog)
        assert decision["danger_tier"] == expected, process_id
