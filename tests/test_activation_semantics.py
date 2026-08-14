from dataclasses import replace

from lab.contracts import DEFAULT_REQUIRED, ProcessContract, SlotRule, load_catalog
from lab.evaluator import evaluate, select_process


def semantic_contract(**changes):
    rules = {
        "who": SlotRule("autoridade solicitante", "session", "who.authorized"),
        "did": SlotRule("ato admitido", "llm", "did.allowed", ("request_projection",)),
        "this": SlotRule("alvo canônico", "llm", "this.canonical"),
        "when": SlotRule("instante de registro", "clock", "when.registered_at"),
        "confirmed_by": SlotRule("confirmação", "session", "confirmed_by.authority"),
        "if_ok": SlotRule("continuidade positiva", "contract", "if_ok.compatible", ("continue",)),
        "if_doubt": SlotRule("continuidade de dúvida", "contract", "if_doubt.compatible", ("attention",)),
        "if_not": SlotRule("continuidade negativa", "contract", "if_not.compatible", ("stop",)),
        "status": SlotRule("estado inicial", "contract", "status.initial", ("registered",)),
    }
    base = ProcessContract(
        process_id="projection-build.v1",
        status="active",
        required_slots=DEFAULT_REQUIRED,
        slot_rules=rules,
        activation_rules_explicit=True,
        must_include=("projection_spec",),
        allowed_who=("dan",),
        adapters=("receipt",),
        danger_tier="L1",
    )
    return replace(base, **changes)


def act(**changes):
    base = {
        "process_id": "projection-build.v1",
        "who": "dan",
        "did": "request_projection",
        "this": "Q3",
        "when": "2026-08-14T04:00:00Z",
        "confirmed_by": "dan",
        "if_ok": "continue",
        "if_doubt": "attention",
        "if_not": "stop",
        "status": "registered",
        "projection_spec": "resumo do Q3",
    }
    base.update(changes)
    return base


def test_no_process_id_is_registered_and_inert_even_when_if_ok_names_a_process():
    catalog = {"projection-build.v1": semantic_contract()}
    receipt = act(process_id=None, if_ok="projection-build.v1")

    assert select_process(receipt, catalog) is None
    decision = evaluate(receipt, catalog=catalog)

    assert decision["registration_state"] == "registered"
    assert decision["activation_state"] == "inert"
    assert decision["matched"] is False
    assert decision["reason"] == "no_process_requested"


def test_unknown_process_is_registered_and_inert_without_catalog_guessing():
    catalog = {"projection-build.v1": semantic_contract()}

    decision = evaluate(act(process_id="missing.v1"), catalog=catalog)

    assert decision["activation_state"] == "inert"
    assert decision["matched"] is False
    assert decision["reason"] == "unknown_process"


def test_present_but_disallowed_did_is_incompatible_with_field_diagnostic():
    catalog = {"projection-build.v1": semantic_contract()}

    decision = evaluate(act(did="register"), catalog=catalog)

    assert decision["activation_state"] == "incompatible"
    assert decision["activate"] is False
    assert decision["field_levels"]["did"] == {
        "predicate": "did.allowed",
        "expected": ["request_projection"],
        "observed": "register",
        "passed": False,
        "code": "did_not_admitted",
    }


def test_unauthorized_who_is_doubted_not_activated():
    catalog = {"projection-build.v1": semantic_contract()}

    decision = evaluate(act(who="mallory"), catalog=catalog)

    assert decision["activation_state"] == "doubted"
    assert decision["reason"] == "who_not_authorized"
    assert decision["field_levels"]["who"]["expected"] == ["dan"]


def test_missing_aux_is_incomplete_even_when_all_slots_are_compatible():
    catalog = {"projection-build.v1": semantic_contract()}
    receipt = act()
    del receipt["projection_spec"]

    decision = evaluate(receipt, catalog=catalog)

    assert decision["activation_state"] == "incompleto"
    assert decision["missing_aux"] == ["projection_spec"]


def test_valid_semantics_without_adapter_are_doubted():
    catalog = {"projection-build.v1": semantic_contract(adapters=())}

    decision = evaluate(act(), catalog=catalog)

    assert decision["activation_state"] == "doubted"
    assert decision["reason"] == "no_adapter_configured"


def test_valid_semantics_adapter_and_required_grant_are_activatable():
    contract = semantic_contract(danger_tier="L4")
    catalog = {contract.process_id: contract}

    decision = evaluate(act(grant_id="a" * 64), catalog=catalog)

    assert decision["activation_state"] == "ativável"
    assert decision["activate"] is True
    assert decision["queueable"] is True


def test_legacy_presence_rules_cannot_activate_a_consequence():
    explicit = semantic_contract()
    legacy_rules = {
        slot: SlotRule(f"legacy {slot}", rule.source, f"{slot}.present")
        for slot, rule in explicit.slot_rules.items()
    }
    legacy = replace(explicit, slot_rules=legacy_rules, activation_rules_explicit=False)

    decision = evaluate(act(), catalog={legacy.process_id: legacy})

    assert decision["activation_state"] == "doubted"
    assert decision["reason"] == "activation_rules_not_explicit"


def test_closed_predicate_vocabulary_rejects_unknown_rule():
    contract = semantic_contract()
    rules = dict(contract.slot_rules)
    rules["this"] = SlotRule("alvo", "llm", "this.magic")
    contract = replace(contract, slot_rules=rules)

    decision = evaluate(act(), catalog={contract.process_id: contract})

    assert decision["activation_state"] == "doubted"
    assert decision["field_levels"]["this"]["code"] == "unknown_predicate"


def test_content_hash_predicate_rejects_a_non_hash_target():
    contract = semantic_contract()
    rules = dict(contract.slot_rules)
    rules["this"] = SlotRule("hash do alvo", "llm", "this.content_hash")
    contract = replace(contract, slot_rules=rules)

    decision = evaluate(act(this="Q3"), catalog={contract.process_id: contract})

    assert decision["activation_state"] == "incompatible"
    assert decision["field_levels"]["this"]["code"] == "this_not_content_hash"


def test_future_predicate_rejects_a_past_time():
    contract = semantic_contract()
    rules = dict(contract.slot_rules)
    rules["when"] = SlotRule("agendamento futuro", "llm", "when.future")
    contract = replace(contract, slot_rules=rules)

    decision = evaluate(act(when="2020-01-01T00:00:00Z"), catalog={contract.process_id: contract})

    assert decision["activation_state"] == "incompatible"
    assert decision["field_levels"]["when"]["code"] == "when_not_future"


def test_evidence_hash_predicate_doubts_unproven_confirmation():
    contract = semantic_contract()
    rules = dict(contract.slot_rules)
    rules["confirmed_by"] = SlotRule(
        "hash da evidência", "evidence", "confirmed_by.evidence_hash"
    )
    contract = replace(contract, slot_rules=rules)

    decision = evaluate(act(confirmed_by="dan"), catalog={contract.process_id: contract})

    assert decision["activation_state"] == "doubted"
    assert decision["field_levels"]["confirmed_by"]["code"] == "confirmation_evidence_invalid"


def test_contract_continuation_and_initial_status_are_not_presence_checks():
    contract = semantic_contract()

    continuation = evaluate(act(if_ok="anything"), catalog={contract.process_id: contract})
    initial = evaluate(act(status="pending"), catalog={contract.process_id: contract})

    assert continuation["activation_state"] == "incompatible"
    assert continuation["field_levels"]["if_ok"]["code"] == "if_ok_incompatible"
    assert initial["activation_state"] == "incompatible"
    assert initial["field_levels"]["status"]["code"] == "status_initial_invalid"


def test_shipped_processes_publish_explicit_admitted_acts():
    expected = {
        "attention-raise.v1": ("raise_attention",),
        "evidence-closure.v1": ("close_evidence",),
        "github-check.v1": ("create_github_check",),
        "inference.v1": ("requested_inference",),
        "memory-register.v1": ("registered",),
        "notification.v1": ("send_notification",),
        "oauth-client.v1": ("register_oauth_client",),
        "projection-build.v1": ("request_projection", "build_projection"),
        "route-to-devin.v1": ("route_to_devin",),
        "worker-run.v1": ("run_worker",),
        "workflow-run.v1": ("run_workflow",),
    }

    catalog = load_catalog()

    assert set(catalog) == set(expected)
    for process_id, admitted in expected.items():
        contract = catalog[process_id]
        assert contract.activation_rules_explicit is True
        assert set(contract.slot_rules) == set(DEFAULT_REQUIRED)
        assert contract.slot_rules["did"].predicate == "did.allowed"
        assert contract.slot_rules["did"].values == admitted
        assert contract.slot_rules["who"].source == "session"
        assert contract.slot_rules["when"].source == "clock"
        assert contract.slot_rules["if_ok"].source == "contract"
