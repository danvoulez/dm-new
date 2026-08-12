from lab.contracts import load_catalog, load_contract
from lab.evaluator import evaluate
from lab.process_catalog import build_process_catalog


def write_nested_contract(root):
    root.mkdir(exist_ok=True)
    path = root / "nested.v1.yml"
    path.write_text(
        "\n".join(
            [
                "process_id: nested.v1",
                "title: Nested Contract",
                "status: active",
                "kind: process",
                "version: 1",
                "owner: lab",
                "process_class: effect",
                "wakes: [nested-frequency]",
                "requires_infra: [executor, sandbox]",
                "composable: true",
                "requires_target_hash: true",
                "idempotency: required",
                "evidence_required: true",
                "activation_ritual:",
                "  required_slots:",
                "    who: who.authorized",
                "    did: did.canonical",
                "    this: this.canonical",
                "    when: when.registered_at",
                "    confirmed_by: confirmed_by.evidence_hash",
                "    if_ok: if_ok.compatible",
                "    if_doubt: if_doubt.compatible",
                "    if_not: if_not.compatible",
                "    status: status.registered",
                "  required_aux: [process, idempotency_key]",
                "  optional_aux: [note]",
                "authority_scope:",
                "  allowed_who: [dan, lab-capital]",
                "  required_grants: [grant:nested]",
                "adapter:",
                "  name: worker_run",
                "  danger_tier: L4",
                "budget_policy:",
                "  acu_limit: 3",
                "  timeout_seconds: 120",
                "  rate_limit: 1/min",
                "evidence_obligation:",
                "  required: true",
                "  must_include: [output_hash, log_hash]",
                "closure_shape:",
                "  success_status: fechado",
                "  doubt_status: doubted",
                "  ghost_status: ghost",
                "if_doubt:",
                "  behavior: attention_raise",
                "runtime_readiness:",
                "  checks: [sandbox_available, grant_valid]",
                "examples:",
                "  valid: []",
                "  incomplete: []",
            ]
        )
    )
    return path


def test_load_contract_supports_nested_spec_shape(tmp_path):
    path = write_nested_contract(tmp_path)

    contract = load_contract(path)

    assert contract.title == "Nested Contract"
    assert contract.kind == "process"
    assert contract.version == "1"
    assert contract.owner == "lab"
    assert contract.process_class == "effect"
    assert contract.wakes == ("nested-frequency",)
    assert contract.requires_infra == ("executor", "sandbox")
    assert contract.composable is True
    assert contract.requires_target_hash is True
    assert contract.idempotency == "required"
    assert contract.evidence_required is True
    assert contract.required_slots == (
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status",
    )
    assert contract.must_include == ("process", "idempotency_key")
    assert contract.optional_aux == ("note",)
    assert contract.allowed_who == ("dan", "lab-capital")
    assert contract.required_grants == ("grant:nested",)
    assert contract.adapters == ("worker_run",)
    assert contract.danger_tier == "L4"
    assert contract.budget_policy == {"acu_limit": "3", "timeout_seconds": "120", "rate_limit": "1/min"}
    assert contract.evidence_must_include == ("output_hash", "log_hash")
    assert contract.closure_shape["success_status"] == "fechado"
    assert contract.if_doubt_behavior == "attention_raise"
    assert contract.runtime_readiness_checks == ("sandbox_available", "grant_valid")


def test_evaluator_uses_nested_required_aux(tmp_path):
    write_nested_contract(tmp_path)
    receipt = {
        "who": "dan",
        "did": "registered",
        "this": "nested",
        "when": "2026-06-22T00:00:00Z",
        "confirmed_by": "test",
        "if_ok": "nested.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "stop",
        "status": "registered",
    }

    out = evaluate(receipt, "nested.v1", catalog=load_catalog(tmp_path))

    assert out["activate"] is False
    assert out["activation_state"] == "incompleto"
    assert out["missing_aux"] == ["process", "idempotency_key"]


def test_process_catalog_exposes_richer_contract_metadata(tmp_path):
    write_nested_contract(tmp_path)

    catalog = build_process_catalog(tmp_path)
    row = catalog["processes"][0]

    assert row["process_id"] == "nested.v1"
    assert row["title"] == "Nested Contract"
    assert row["owner"] == "lab"
    assert row["process_class"] == "effect"
    assert row["requires_infra"] == ["executor", "sandbox"]
    assert row["idempotency"] == "required"
    assert row["evidence_required"] is True
    assert row["required_grants"] == ["grant:nested"]
