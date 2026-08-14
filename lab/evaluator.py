from .activation_predicates import evaluate_slot
from .adapters import effective_danger_tier
from .contracts import ProcessContract, load_catalog

SLOTS = ("who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status")
DANGEROUS_TIERS = {"L4", "L5"}
DOUBT_PREDICATE_CODES = {
    "who_not_authorized",
    "confirmed_by_not_authorized",
    "confirmation_evidence_invalid",
    "unknown_predicate",
}


def completion(receipt: dict, contract: ProcessContract | None = None) -> dict:
    required = contract.required_slots if contract else SLOTS
    missing = [slot for slot in required if not str(receipt.get(slot, ""))]
    include_missing = [field for field in (contract.must_include if contract else ()) if field not in receipt]
    complete = not missing and not include_missing
    return {
        "complete": complete,
        "missing_slots": missing,
        "missing_required_fields": include_missing,
        "missing_aux": include_missing,
        "process_id": contract.process_id if contract else None,
        "activate": complete and contract is not None,
    }


def select_process(receipt: dict, catalog=None) -> ProcessContract | None:
    catalog = catalog or load_catalog()
    process_id = str(receipt.get("process_id") or "")
    return catalog.get(process_id) if process_id else None


def _inert(receipt: dict, reason: str, process_id: str | None = None) -> dict:
    base = completion(receipt, None)
    base.update(
        {
            "process_id": process_id,
            "activate": False,
            "matched": False,
            "registration_state": "registered",
            "activation_state": "inert",
            "queueable": False,
            "reason": reason,
            "field_levels": {},
        }
    )
    return base


def evaluate(receipt: dict, process_id: str | None = None, catalog=None) -> dict:
    catalog = catalog or load_catalog()
    requested_process_id = str(receipt.get("process_id") or "")
    if not requested_process_id:
        return _inert(receipt, "no_process_requested")
    if process_id and process_id != requested_process_id:
        return _inert(receipt, "process_route_mismatch", requested_process_id)

    contract = select_process(receipt, catalog)
    if not contract:
        return _inert(receipt, "unknown_process", requested_process_id)

    out = completion(receipt, contract)
    adapter = contract.adapters[0] if contract.adapters else None
    danger_tier = effective_danger_tier(contract.danger_tier, adapter)
    field_levels = {
        slot: evaluate_slot(
            contract.slot_rules[slot],
            receipt.get(slot),
            {"contract": contract, "receipt": receipt, "slot": slot},
        )
        for slot in contract.required_slots
        if slot in contract.slot_rules
    }
    out.update(
        {
            "matched": True,
            "registration_state": "registered",
            "process_status": contract.status,
            "adapter": adapter,
            "declared_danger_tier": contract.danger_tier,
            "danger_tier": danger_tier,
            "evidence_required": contract.evidence_obligation != "none",
            "evidence_must_include": list(contract.evidence_must_include),
            "allowed_who": list(contract.allowed_who),
            "field_levels": field_levels,
        }
    )

    if contract.status != "active":
        out.update({"activate": False, "activation_state": "inert", "queueable": False, "reason": "process_not_active"})
        return out
    if out["missing_slots"] or out["missing_aux"]:
        out.update({"activate": False, "activation_state": "incompleto", "queueable": False, "reason": "incomplete"})
        return out
    if not contract.activation_rules_explicit or any(slot not in contract.slot_rules for slot in SLOTS):
        out.update(
            {
                "activate": False,
                "activation_state": "doubted",
                "queueable": False,
                "reason": "activation_rules_not_explicit",
            }
        )
        return out

    failures = [field_levels[slot] for slot in contract.required_slots if not field_levels[slot]["passed"]]
    if failures:
        reason = failures[0]["code"]
        state = "doubted" if any(item["code"] in DOUBT_PREDICATE_CODES for item in failures) else "incompatible"
        out.update({"activate": False, "activation_state": state, "queueable": False, "reason": reason})
        return out
    if danger_tier in DANGEROUS_TIERS and "grant_id" not in receipt:
        out.update(
            {
                "activate": False,
                "activation_state": "doubted",
                "queueable": False,
                "reason": "missing_required_grant",
            }
        )
        return out
    if not contract.adapters:
        out.update(
            {
                "activate": False,
                "activation_state": "doubted",
                "queueable": False,
                "reason": "no_adapter_configured",
            }
        )
        return out

    out.update({"activate": True, "activation_state": "ativável", "queueable": True, "reason": "complete"})
    return out
