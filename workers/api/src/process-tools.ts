import { humanProcessTitle, loadContracts, toProcessTypeView, type ProcessContract, type Slot } from "./contracts";
import type { PgClient } from "./db";
import type { ActFields } from "./receipt";

const HASH = /^[0-9a-f]{64}$/;
const SLOTS: Slot[] = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];
const SLOT_SET = new Set<string>(SLOTS);
const RESERVED_FIELDS = new Set(["process_id", "contract_hash", "id", "hashes", "receipt_version", "json_canonicalization"]);

export class ProcessToolError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown>;

  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "ProcessToolError";
    this.code = code;
    this.detail = detail;
  }
}

export type ProcessSearchResult = ReturnType<typeof toProcessTypeView> & {
  purpose: string;
  citable: boolean;
};

export type ProcessContractForLLM = {
  process_id: string;
  registered_hash: string | null;
  citable: boolean;
  purpose: string;
  slot_rules: ProcessContract["slot_rules"];
  required_aux: string[];
  optional_aux: string[];
  examples: unknown[];
  danger: {
    tier: string;
    readiness: string;
    readiness_reason: string;
  };
  consequence: {
    adapter: string | null;
    evidence_must_include: string[];
  };
};

export type FormalizedActProposal = {
  process_id?: string;
  contract_hash?: string;
  slots?: Partial<Record<Slot, unknown>> & Record<string, unknown>;
  fields?: Record<string, unknown>;
  missing?: string[];
  citations?: string[];
};

export type ActSources = {
  session: Partial<Record<Slot, unknown>>;
  clock: Partial<Record<Slot, unknown>>;
  evidence: Partial<Record<Slot, unknown>>;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function purposeOf(contract: ProcessContract): string {
  return contract.slot_rules?.did?.meaning || contract.title || contract.process_id;
}

function searchableText(contract: ProcessContract): string {
  const rules = Object.values(contract.slot_rules ?? {}).flatMap((rule) => [rule?.meaning, ...(rule?.values ?? [])]);
  return normalize([contract.process_id, contract.title, humanProcessTitle(contract.process_id, contract.title), purposeOf(contract), ...rules].filter(Boolean).join(" "));
}

export async function searchProcesses(client: PgClient, query: string): Promise<ProcessSearchResult[]> {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const catalog = await loadContracts(client);
  return Array.from(catalog.values())
    .filter((contract) => terms.length === 0 || terms.every((term) => searchableText(contract).includes(term)))
    .map((contract) => ({
      ...toProcessTypeView(contract),
      purpose: purposeOf(contract),
      citable: HASH.test(contract.registered_hash ?? ""),
    }))
    .sort((left, right) => left.process_id.localeCompare(right.process_id));
}

export async function readProcessContract(client: PgClient, processId: string): Promise<ProcessContractForLLM> {
  const contract = (await loadContracts(client)).get(processId);
  if (!contract) throw new ProcessToolError("process_not_found", `process contract not found: ${processId}`, { process_id: processId });
  const view = toProcessTypeView(contract);
  return {
    process_id: contract.process_id,
    registered_hash: contract.registered_hash ?? null,
    citable: HASH.test(contract.registered_hash ?? ""),
    purpose: purposeOf(contract),
    slot_rules: contract.slot_rules ?? {},
    required_aux: contract.must_include ?? [],
    optional_aux: contract.optional_aux ?? [],
    examples: [],
    danger: {
      tier: view.danger_tier,
      readiness: view.readiness,
      readiness_reason: view.readiness_reason,
    },
    consequence: {
      adapter: view.adapter,
      evidence_must_include: contract.evidence_must_include ?? [],
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function proposalParts(proposal: FormalizedActProposal): {
  slots: Record<string, unknown>;
  fields: Record<string, unknown>;
  citations: string[];
} {
  const slots = proposal.slots && typeof proposal.slots === "object" && !Array.isArray(proposal.slots) ? proposal.slots : {};
  const fields = proposal.fields && typeof proposal.fields === "object" && !Array.isArray(proposal.fields) ? proposal.fields : {};
  const citations = Array.isArray(proposal.citations) ? proposal.citations.filter((item): item is string => typeof item === "string") : [];
  for (const key of Object.keys(fields)) {
    if (SLOT_SET.has(key) || RESERVED_FIELDS.has(key)) {
      throw new ProcessToolError("field_reserved", `field ${key} belongs to the LogLine envelope`, { field: key });
    }
  }
  return { slots, fields, citations };
}

function pureRegistration(proposal: FormalizedActProposal, sources: ActSources): ActFields {
  const { slots, fields, citations } = proposalParts(proposal);
  for (const slot of Object.keys(slots)) {
    if (slot !== "did" && slot !== "this") {
      throw new ProcessToolError("slot_source_violation", `slot ${slot} is not supplied by the LLM`, { slot, expected_source: slot === "when" ? "clock" : "session_or_system" });
    }
  }
  const act: ActFields = {
    who: stringValue(sources.session.who),
    did: stringValue(slots.did),
    this: stringValue(slots.this),
    when: stringValue(sources.clock.when),
    confirmed_by: stringValue(sources.session.confirmed_by),
    if_ok: "registered.inert",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "registered",
    ...fields,
  };
  if (citations.length) act.citations = [...new Set(citations)];
  return act;
}

export function assembleAct(
  proposal: FormalizedActProposal,
  sources: ActSources,
  contract?: ProcessContract,
): ActFields {
  const processId = String(proposal.process_id ?? "").trim();
  if (!processId) {
    if (proposal.contract_hash) throw new ProcessToolError("contract_without_process", "contract_hash requires process_id");
    return pureRegistration(proposal, sources);
  }
  if (!contract || contract.process_id !== processId) {
    throw new ProcessToolError("process_not_found", `process contract not loaded: ${processId}`, { process_id: processId });
  }
  const registeredHash = String(contract.registered_hash ?? "");
  if (!HASH.test(registeredHash)) {
    throw new ProcessToolError("contract_not_citable", `process contract has no registered hash: ${processId}`, { process_id: processId });
  }
  const suppliedHash = String(proposal.contract_hash ?? "");
  if (suppliedHash !== registeredHash) {
    throw new ProcessToolError("contract_hash_mismatch", "the cited contract is not the registered contract", {
      process_id: processId, expected: registeredHash, observed: suppliedHash,
    });
  }
  const { slots, fields, citations } = proposalParts(proposal);
  if (!citations.includes(registeredHash)) {
    throw new ProcessToolError("contract_citation_missing", "the registered contract hash must be cited", { process_id: processId });
  }

  const allowedAux = new Set([...(contract.must_include ?? []), ...(contract.optional_aux ?? [])]);
  for (const key of Object.keys(fields)) {
    if (!allowedAux.has(key)) throw new ProcessToolError("aux_not_declared", `field ${key} is not declared by ${processId}`, { field: key, process_id: processId });
  }

  const act: ActFields = {};
  for (const slot of SLOTS) {
    const rule = contract.slot_rules?.[slot];
    if (!rule) throw new ProcessToolError("activation_rules_not_explicit", `slot rule missing: ${slot}`, { slot, process_id: processId });
    if (slot in slots && rule.source !== "llm") {
      throw new ProcessToolError("slot_source_violation", `slot ${slot} must come from ${rule.source}`, { slot, expected_source: rule.source });
    }
    if (rule.source === "llm") act[slot] = stringValue(slots[slot]);
    else if (rule.source === "session") act[slot] = stringValue(sources.session[slot]);
    else if (rule.source === "clock") act[slot] = stringValue(sources.clock[slot]);
    else if (rule.source === "evidence") act[slot] = stringValue(sources.evidence[slot]);
    else {
      const literal = rule.values?.[0];
      if (!literal) throw new ProcessToolError("contract_literal_missing", `contract slot ${slot} has no literal value`, { slot, process_id: processId });
      act[slot] = literal;
    }
  }
  Object.assign(act, fields, {
    process_id: processId,
    contract_hash: registeredHash,
    citations: [...new Set(citations)],
  });
  return act;
}
