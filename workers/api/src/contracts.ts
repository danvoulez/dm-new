import type { PgClient } from "./db";

export type Slot = "who" | "did" | "this" | "when" | "confirmed_by" | "if_ok" | "if_doubt" | "if_not" | "status";
export type SlotSource = "llm" | "session" | "clock" | "contract" | "evidence";
export type SlotRule = {
  meaning: string;
  source: SlotSource;
  predicate: string;
  values?: string[];
};

export type ProcessContract = {
  process_id: string;
  title?: string;
  status?: string;
  required_slots?: string[];
  slot_rules?: Partial<Record<Slot, SlotRule>>;
  activation_rules_explicit?: boolean;
  registered_hash?: string | null;
  must_include?: string[];
  optional_aux?: string[];
  allowed_who?: string[];
  required_grants?: string[];
  adapters?: string[];
  danger_tier?: string;
  evidence_obligation?: string;
  evidence_must_include?: string[];
  doubt_path?: string;
};

export type ProcessTypeView = {
  process_id: string;
  title: string;
  requires: string[];
  accepts: string[];
  required_slots: string[];
  adapter: string | null;
  danger_tier: string;
  needs_approval: boolean;
  irreversible: boolean;
  runnable: boolean;
  readiness: "runnable" | "blocked" | "contract-only" | "not-runnable";
  readiness_reason: string;
  evidence_must_include: string[];
  slot_rules: Partial<Record<Slot, SlotRule>>;
  registered_hash: string | null;
};

export const ADAPTER_MIN_TIER: Record<string, string> = {
  receipt: "L0",
  projection: "L1",
  inference: "L3",
  "oauth-client": "L3",
};

export const REGISTERED_ADAPTERS = new Set(["receipt"]);
const TIER_ORDER = ["L0", "L1", "L2", "L3", "L4", "L5"];
const DEFAULT_SLOTS = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];
const SLOT_SOURCES = new Set<SlotSource>(["llm", "session", "clock", "contract", "evidence"]);

function validSlotRule(value: unknown): value is SlotRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as Partial<SlotRule>;
  if (typeof rule.meaning !== "string" || !rule.meaning.trim()) return false;
  if (typeof rule.source !== "string" || !SLOT_SOURCES.has(rule.source as SlotSource)) return false;
  if (typeof rule.predicate !== "string" || !rule.predicate.trim()) return false;
  return rule.values === undefined || (
    Array.isArray(rule.values)
    && rule.values.every((item) => typeof item === "string" && Boolean(item))
  );
}

const HUMAN_PROCESS_TITLES: Record<string, string> = {
  "attention-raise.v1": "Pedir atenção",
  "evidence-closure.v1": "Fechar com evidência",
  "github-check.v1": "Verificar GitHub",
  "inference.v1": "Inferência",
  "memory-register.v1": "Registrar memória",
  "notification.v1": "Notificação",
  "oauth-client.v1": "Cliente OAuth",
  "projection-build.v1": "Criar resumo",
  "route-to-devin.v1": "Enviar para Devin",
  "worker-run.v1": "Executar worker",
  "workflow-run.v1": "Executar fluxo",
};

export function humanProcessTitle(processId: string, declaredTitle?: string | null): string {
  const title = String(declaredTitle ?? "").trim();
  if (title && title !== processId) return title;
  if (HUMAN_PROCESS_TITLES[processId]) return HUMAN_PROCESS_TITLES[processId];
  const plain = processId.replace(/\.v\d+$/, "").replace(/[-_]+/g, " ").trim();
  return plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : "Processo";
}

export function effectiveDangerTier(declared = "L0", adapter: string | null): string {
  const floor = ADAPTER_MIN_TIER[adapter ?? ""] ?? "L0";
  const declaredIndex = TIER_ORDER.indexOf(declared);
  const floorIndex = TIER_ORDER.indexOf(floor);
  if (declaredIndex < 0) return floor;
  return declaredIndex >= floorIndex ? declared : floor;
}

export function readiness(contract: ProcessContract): Pick<ProcessTypeView, "runnable" | "readiness" | "readiness_reason"> {
  if ((contract.status ?? "active") !== "active") {
    return { runnable: false, readiness: "not-runnable", readiness_reason: `process status is ${contract.status}` };
  }
  const rules = DEFAULT_SLOTS.map((slot) => contract.slot_rules?.[slot as Slot]);
  const hasNineSemanticRules = rules.every(Boolean);
  if (!hasNineSemanticRules || contract.activation_rules_explicit === false) {
    return { runnable: false, readiness: "contract-only", readiness_reason: "activation ritual lacks explicit semantic rules" };
  }
  if (!rules.every(validSlotRule)) {
    return { runnable: false, readiness: "contract-only", readiness_reason: "activation ritual contains invalid semantic rules" };
  }
  const adapters = contract.adapters ?? [];
  if (!adapters.length) return { runnable: false, readiness: "contract-only", readiness_reason: "no adapter configured" };
  const missing = adapters.filter((adapter) => !REGISTERED_ADAPTERS.has(adapter));
  if (missing.length) return { runnable: false, readiness: "contract-only", readiness_reason: `adapter not configured: ${missing.join(", ")}` };
  const tier = contract.danger_tier ?? "L0";
  if (tier === "L4" || tier === "L5") {
    return { runnable: false, readiness: "blocked", readiness_reason: "requires grant/budget/sandbox" };
  }
  return { runnable: true, readiness: "runnable", readiness_reason: "contract active and adapter configured" };
}

export function toProcessTypeView(contract: ProcessContract): ProcessTypeView {
  const adapter = contract.adapters?.[0] ?? null;
  const dangerTier = effectiveDangerTier(contract.danger_tier ?? "L0", adapter);
  return {
    process_id: contract.process_id,
    title: humanProcessTitle(contract.process_id, contract.title),
    requires: contract.must_include ?? [],
    accepts: contract.optional_aux ?? [],
    required_slots: contract.required_slots?.length ? contract.required_slots : DEFAULT_SLOTS,
    adapter,
    danger_tier: dangerTier,
    needs_approval: dangerTier === "L4" || dangerTier === "L5",
    irreversible: dangerTier === "L5",
    ...readiness(contract),
    evidence_must_include: contract.evidence_must_include ?? [],
    slot_rules: contract.slot_rules ?? {},
    registered_hash: contract.registered_hash ?? null,
  };
}

export async function loadContracts(client: PgClient): Promise<Map<string, ProcessContract>> {
  const result = await client.query<{ process_id: string; title: string; status: string; registered_hash: string | null; contract: ProcessContract }>(
    "SELECT process_id,title,status,registered_hash,contract FROM public.process_contracts ORDER BY process_id",
  );
  return new Map(result.rows.map((row) => {
    const contract = {
      ...row.contract,
      process_id: row.process_id,
      title: row.title || row.contract.title,
      status: row.status || row.contract.status,
      registered_hash: row.registered_hash ?? row.contract.registered_hash ?? null,
    };
    return [row.process_id, contract];
  }));
}
