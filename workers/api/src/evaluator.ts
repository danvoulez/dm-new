import { effectiveDangerTier, type ProcessContract } from "./contracts";
import { SLOTS } from "./receipt";

export type Evaluation = Record<string, unknown> & {
  activate: boolean;
  matched: boolean;
  reason: string;
  process_id?: string | null;
  adapter?: string | null;
  missing_slots: string[];
  missing_aux: string[];
};

function completion(receipt: Record<string, unknown>, contract?: ProcessContract): Pick<Evaluation, "activate" | "missing_slots" | "missing_aux"> & { complete: boolean; process_id: string | null } {
  const required = contract?.required_slots?.length ? contract.required_slots : [...SLOTS];
  const missingSlots = required.filter((slot) => !String(receipt[slot] ?? ""));
  const missingAux = (contract?.must_include ?? []).filter((field) => !(field in receipt));
  const complete = missingSlots.length === 0 && missingAux.length === 0;
  return { complete, missing_slots: missingSlots, missing_aux: missingAux, process_id: contract?.process_id ?? null, activate: complete && !!contract };
}

function selectProcess(receipt: Record<string, unknown>, catalog: Map<string, ProcessContract>): ProcessContract | undefined {
  const wanted = String(receipt.process_id || receipt.if_ok || "");
  if (wanted && catalog.has(wanted)) return catalog.get(wanted);
  for (const contract of catalog.values()) {
    if (completion(receipt, contract).complete) return contract;
  }
  return undefined;
}

export function evaluate(receipt: Record<string, unknown>, catalog: Map<string, ProcessContract>, processId?: string): Evaluation {
  const contract = processId ? catalog.get(processId) : selectProcess(receipt, catalog);
  if (!contract) {
    const base = completion(receipt);
    return {
      ...base,
      activate: false,
      matched: false,
      registration_state: "registered",
      activation_state: "inert",
      queueable: false,
      reason: "no_matching_process_contract",
      field_levels: {},
    };
  }

  const out = completion(receipt, contract);
  const adapter = contract.adapters?.[0] ?? null;
  const dangerTier = effectiveDangerTier(contract.danger_tier ?? "L0", adapter);
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
    field_levels: Object.fromEntries(SLOTS.filter((slot) => String(receipt[slot] ?? "")).map((slot) => [slot, `${slot}.present`])),
    reason: "complete",
  };

  if ((contract.status ?? "active") !== "active") Object.assign(result, { activate: false, activation_state: "inert", queueable: false, reason: "process_not_active" });
  else if (out.missing_slots.length || out.missing_aux.length) Object.assign(result, { activate: false, activation_state: "incompleto", queueable: false, reason: "incomplete" });
  else if ((dangerTier === "L4" || dangerTier === "L5") && !("grant_id" in receipt)) Object.assign(result, { activate: false, activation_state: "doubted", queueable: false, reason: "missing_required_grant" });
  else if (!(contract.adapters?.length)) Object.assign(result, { activate: false, activation_state: "doubted", queueable: false, reason: "no_adapter_configured" });
  else Object.assign(result, { activate: true, activation_state: "ativável", queueable: true, reason: "complete" });
  return result;
}
