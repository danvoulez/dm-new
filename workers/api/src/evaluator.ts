import { evaluateSlot, type SlotEvaluation } from "./activation-predicates.ts";
import { effectiveDangerTier, type ProcessContract, type Slot } from "./contracts.ts";
import { SLOTS } from "./receipt.ts";

export type Evaluation = Record<string, unknown> & {
  activate: boolean;
  matched: boolean;
  reason: string;
  process_id?: string | null;
  adapter?: string | null;
  missing_slots: string[];
  missing_aux: string[];
};

const DOUBT_PREDICATE_CODES = new Set([
  "who_not_authorized",
  "confirmed_by_not_authorized",
  "confirmation_evidence_invalid",
  "unknown_predicate",
]);

function completion(receipt: Record<string, unknown>, contract?: ProcessContract): Pick<Evaluation, "activate" | "missing_slots" | "missing_aux"> & { complete: boolean; process_id: string | null } {
  const required = contract?.required_slots?.length ? contract.required_slots : [...SLOTS];
  const missingSlots = required.filter((slot) => !String(receipt[slot] ?? ""));
  const missingAux = (contract?.must_include ?? []).filter((field) => !(field in receipt));
  const complete = missingSlots.length === 0 && missingAux.length === 0;
  return { complete, missing_slots: missingSlots, missing_aux: missingAux, process_id: contract?.process_id ?? null, activate: complete && !!contract };
}

export function selectProcess(receipt: Record<string, unknown>, catalog: Map<string, ProcessContract>): ProcessContract | undefined {
  const processId = String(receipt.process_id ?? "");
  return processId ? catalog.get(processId) : undefined;
}

function inert(receipt: Record<string, unknown>, reason: string, processId?: string): Evaluation {
  return {
    ...completion(receipt),
    process_id: processId ?? null,
    activate: false,
    matched: false,
    registration_state: "registered",
    activation_state: "inert",
    queueable: false,
    reason,
    field_levels: {},
  };
}

export function evaluate(receipt: Record<string, unknown>, catalog: Map<string, ProcessContract>, processId?: string): Evaluation {
  const requestedProcessId = String(receipt.process_id ?? "");
  if (!requestedProcessId) return inert(receipt, "no_process_requested");
  if (processId && processId !== requestedProcessId) return inert(receipt, "process_route_mismatch", requestedProcessId);

  const contract = selectProcess(receipt, catalog);
  if (!contract) return inert(receipt, "unknown_process", requestedProcessId);

  const out = completion(receipt, contract);
  const adapter = contract.adapters?.[0] ?? null;
  const dangerTier = effectiveDangerTier(contract.danger_tier ?? "L0", adapter);
  const fieldLevels = Object.fromEntries(
    SLOTS.flatMap((slot) => {
      const rule = contract.slot_rules?.[slot];
      return rule ? [[slot, evaluateSlot(rule, receipt[slot], { contract, receipt, slot })]] : [];
    }),
  ) as Partial<Record<Slot, SlotEvaluation>>;
  const result: Evaluation = {
    ...out,
    matched: true,
    registration_state: "registered",
    process_status: contract.status ?? "active",
    adapter,
    declared_danger_tier: contract.danger_tier ?? "L0",
    danger_tier: dangerTier,
    evidence_required: (contract.evidence_obligation ?? "separate-result-act") !== "none",
    evidence_must_include: contract.evidence_must_include ?? [],
    allowed_who: contract.allowed_who ?? [],
    field_levels: fieldLevels,
    reason: "complete",
  };

  if ((contract.status ?? "active") !== "active") {
    Object.assign(result, { activate: false, activation_state: "inert", queueable: false, reason: "process_not_active" });
    return result;
  }
  if (out.missing_slots.length || out.missing_aux.length) {
    Object.assign(result, { activate: false, activation_state: "incompleto", queueable: false, reason: "incomplete" });
    return result;
  }
  const hasNineRules = SLOTS.every((slot) => Boolean(contract.slot_rules?.[slot]));
  if (!hasNineRules || contract.activation_rules_explicit === false) {
    Object.assign(result, { activate: false, activation_state: "doubted", queueable: false, reason: "activation_rules_not_explicit" });
    return result;
  }
  const failures = SLOTS.map((slot) => fieldLevels[slot]).filter((item): item is SlotEvaluation => Boolean(item && !item.passed));
  if (failures.length) {
    const state = failures.some((item) => DOUBT_PREDICATE_CODES.has(item.code)) ? "doubted" : "incompatible";
    Object.assign(result, { activate: false, activation_state: state, queueable: false, reason: failures[0].code });
    return result;
  }
  if ((dangerTier === "L4" || dangerTier === "L5") && !("grant_id" in receipt)) {
    Object.assign(result, { activate: false, activation_state: "doubted", queueable: false, reason: "missing_required_grant" });
    return result;
  }
  if (!(contract.adapters?.length)) {
    Object.assign(result, { activate: false, activation_state: "doubted", queueable: false, reason: "no_adapter_configured" });
    return result;
  }

  Object.assign(result, { activate: true, activation_state: "ativável", queueable: true, reason: "complete" });
  return result;
}
