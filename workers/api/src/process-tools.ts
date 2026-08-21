import { humanProcessTitle, loadContracts, toProcessTypeView, type ProcessContract, type Slot } from "./contracts.ts";
import type { PgClient } from "./db";
import type { ActFields, Envelope } from "./receipt";

const HASH = /^[0-9a-f]{64}$/;
export const LOG_LINE_SLOTS: Slot[] = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];
const SLOT_SET = new Set<string>(LOG_LINE_SLOTS);
const RESERVED_FIELDS = new Set(["process_id", "contract_hash", "id", "hashes", "receipt_version", "json_canonicalization", "envelope"]);
const SEARCH_STOP_WORDS = new Set(["uma", "uns", "com", "para", "por", "sem", "sobre", "este", "esta", "isso", "que", "dos", "das"]);

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
  /** Project/process conventions for model context; never kernel fill rules. */
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
  slots: Record<Slot, unknown> & Record<string, unknown>;
  fields?: Record<string, unknown>;
  envelope: Envelope;
  citations?: string[];
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
  const terms = [...new Set(normalize(query).split(/\s+/).filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term)))];
  const catalog = await loadContracts(client);
  return Array.from(catalog.values())
    .map((contract) => {
      const text = searchableText(contract);
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return {
        view: {
          ...toProcessTypeView(contract),
          purpose: purposeOf(contract),
          citable: HASH.test(contract.registered_hash ?? ""),
        },
        score,
      };
    })
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort((left, right) => right.score - left.score || left.view.process_id.localeCompare(right.view.process_id))
    .map(({ view }) => view);
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

function proposalParts(proposal: FormalizedActProposal): {
  slots: Record<string, unknown>;
  fields: Record<string, unknown>;
  envelope: Envelope;
  citations: string[];
} {
  const slots: Record<string, unknown> = proposal.slots && typeof proposal.slots === "object" && !Array.isArray(proposal.slots)
    ? proposal.slots
    : {};
  const fields: Record<string, unknown> = proposal.fields && typeof proposal.fields === "object" && !Array.isArray(proposal.fields)
    ? proposal.fields
    : {};
  const envelope: Envelope = proposal.envelope && typeof proposal.envelope === "object" && !Array.isArray(proposal.envelope)
    ? proposal.envelope
    : {};
  const citations = Array.isArray(proposal.citations) ? proposal.citations.filter((item): item is string => typeof item === "string") : [];

  for (const key of Object.keys(slots)) {
    if (!SLOT_SET.has(key)) throw new ProcessToolError("slot_unknown", `unknown LogLine slot ${key}`, { slot: key });
  }
  for (const slot of LOG_LINE_SLOTS) {
    if (!(slot in slots)) throw new ProcessToolError("slot_missing", `LLM proposal must contain slot ${slot}`, { slot });
    if (typeof slots[slot] !== "string") throw new ProcessToolError("slot_type", `LogLine slot ${slot} must be a string`, { slot });
  }
  if (!proposal.envelope || typeof proposal.envelope !== "object" || Array.isArray(proposal.envelope)) {
    throw new ProcessToolError("envelope_missing", "LLM proposal must explicitly contain an envelope object");
  }
  for (const key of Object.keys(fields)) {
    if (SLOT_SET.has(key) || RESERVED_FIELDS.has(key)) {
      throw new ProcessToolError("field_reserved", `field ${key} belongs to the LogLine/envelope boundary`, { field: key });
    }
  }
  return { slots, fields, envelope, citations };
}

/**
 * Losslessly assemble a complete LLM-authored proposal for the register boundary.
 *
 * No semantic slot or envelope value is synthesized here. Process contract material
 * is context and an objective citation anchor only; it may not fill/coerce semantics.
 */
export function assembleAct(
  proposal: FormalizedActProposal,
  contract?: ProcessContract,
): ActFields {
  const { slots, fields, envelope, citations } = proposalParts(proposal);
  const processId = String(proposal.process_id ?? "").trim();
  const act: ActFields = Object.fromEntries(LOG_LINE_SLOTS.map((slot) => [slot, slots[slot]]));
  Object.assign(act, fields, { envelope: { ...envelope } });

  if (!processId) {
    if (proposal.contract_hash) throw new ProcessToolError("contract_without_process", "contract_hash requires process_id");
    if (citations.length) act.citations = [...new Set(citations)];
    return act;
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
      process_id: processId,
      expected: registeredHash,
      observed: suppliedHash,
    });
  }
  if (!citations.includes(registeredHash)) {
    throw new ProcessToolError("contract_citation_missing", "the registered contract hash must be cited", { process_id: processId });
  }

  Object.assign(act, {
    process_id: processId,
    contract_hash: registeredHash,
    citations: [...new Set(citations)],
  });
  return act;
}
