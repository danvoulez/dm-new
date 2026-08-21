import type { PgClient } from "./db";
import type { Receipt } from "./receipt";

const HASH = /^[0-9a-f]{64}$/;
export type ProcessOutcome = "ok" | "doubt" | "not";

export type ProcessNode = {
  id: string;
  activity: string;
  responsible: string;
  if_ok?: string | null;
  if_doubt?: string | null;
  if_not?: string | null;
};

export type CustodyProcessType = {
  process_id: string;
  registered_hash: string;
  start: string;
  nodes: Map<string, ProcessNode>;
  definition: Record<string, unknown>;
};

export type ProcessCurrentState = {
  process_instance: string;
  process_type: string;
  process_id: string;
  opened_tuple: string;
  current_tuple: string;
  current_node: string | null;
  responsible: string | null;
  activity: string | null;
  status: "open" | "closed";
  outcome: ProcessOutcome | null;
};

export type CustodyQueueItem = {
  queue_id: string;
  process_instance: string;
  node: string;
  responsible: string;
  source_tuple: string;
  status: string;
  claimed_by: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

export class ProcessMachineError extends Error {
  readonly code: string;
  readonly status = 422;
  readonly detail?: Record<string, unknown>;

  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "ProcessMachineError";
    this.code = code;
    this.detail = detail;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNodes(definition: Record<string, unknown>): { start: string; nodes: Map<string, ProcessNode> } | null {
  const rawNodes = definition.nodes;
  const nodes = new Map<string, ProcessNode>();
  if (Array.isArray(rawNodes)) {
    for (const raw of rawNodes) {
      const item = object(raw);
      if (!item) continue;
      const id = text(item.id ?? item.node);
      const activity = text(item.activity);
      const responsible = text(item.responsible);
      if (!id || !activity || !responsible) continue;
      nodes.set(id, {
        id,
        activity,
        responsible,
        if_ok: text(item.if_ok) || null,
        if_doubt: text(item.if_doubt) || null,
        if_not: text(item.if_not) || null,
      });
    }
  } else {
    const record = object(rawNodes);
    if (record) {
      for (const [id, raw] of Object.entries(record)) {
        const item = object(raw);
        if (!item) continue;
        const activity = text(item.activity);
        const responsible = text(item.responsible);
        if (!id || !activity || !responsible) continue;
        nodes.set(id, {
          id,
          activity,
          responsible,
          if_ok: text(item.if_ok) || null,
          if_doubt: text(item.if_doubt) || null,
          if_not: text(item.if_not) || null,
        });
      }
    }
  }
  if (!nodes.size) return null;
  const start = text(definition.start ?? definition.starts_at ?? definition.initial_node) || nodes.keys().next().value;
  if (!start || !nodes.has(start)) return null;
  return { start, nodes };
}

export async function loadCustodyProcessTypeByHash(client: PgClient, hash: string): Promise<CustodyProcessType | null> {
  if (!HASH.test(hash)) return null;
  const result = await client.query<{
    process_id: string;
    registered_hash: string;
    definition: Record<string, unknown>;
  }>(
    `SELECT process_id,registered_hash,definition
     FROM public.current_process_types
     WHERE registered_hash=$1 LIMIT 1`,
    [hash],
  );
  const row = result.rows[0];
  if (!row) return null;
  const parsed = parseNodes(row.definition ?? {});
  if (!parsed) return null;
  return {
    process_id: row.process_id,
    registered_hash: row.registered_hash,
    definition: row.definition,
    ...parsed,
  };
}

export async function loadCustodyProcessTypeById(client: PgClient, processId: string): Promise<CustodyProcessType | null> {
  const result = await client.query<{
    process_id: string;
    registered_hash: string;
    definition: Record<string, unknown>;
  }>(
    `SELECT process_id,registered_hash,definition
     FROM public.current_process_types
     WHERE process_id=$1 LIMIT 1`,
    [processId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const parsed = parseNodes(row.definition ?? {});
  if (!parsed) return null;
  return {
    process_id: row.process_id,
    registered_hash: row.registered_hash,
    definition: row.definition,
    ...parsed,
  };
}

export function outcomeFromStatus(status: unknown): ProcessOutcome | null {
  const value = text(status);
  return value === "ok" || value === "doubt" || value === "not" ? value : null;
}

function branchFor(node: ProcessNode, outcome: ProcessOutcome): string | null {
  const target = outcome === "ok" ? node.if_ok : outcome === "doubt" ? node.if_doubt : node.if_not;
  return text(target) || null;
}

function isTerminal(target: string | null): boolean {
  return !target || target === "stop" || target === "close" || target === "closed" || target === "end";
}

async function openingRow(client: PgClient, instanceHash: string) {
  const result = await client.query<{ content_hash: string; tuple_hash: string; act: Receipt }>(
    `SELECT content_hash,tuple_hash,act
     FROM public.logline_acts
     WHERE content_hash=$1 AND did='opened_process'
     ORDER BY inserted_at,tuple_hash LIMIT 1`,
    [instanceHash],
  );
  return result.rows[0] ?? null;
}

async function processHistory(client: PgClient, instanceHash: string) {
  const result = await client.query<{ content_hash: string; tuple_hash: string; act: Receipt; inserted_at: string }>(
    `SELECT content_hash,tuple_hash,act,inserted_at::text
     FROM public.logline_acts
     WHERE content_hash=$1 AND did='opened_process'
        OR act->'envelope'->>'process'=$1
     ORDER BY inserted_at,tuple_hash`,
    [instanceHash],
  );
  return result.rows;
}

export async function processCurrentState(client: PgClient, instanceHash: string): Promise<ProcessCurrentState | null> {
  if (!HASH.test(instanceHash)) return null;
  const opening = await openingRow(client, instanceHash);
  if (!opening) return null;
  const processTypeHash = text(opening.act.process_type);
  const type = await loadCustodyProcessTypeByHash(client, processTypeHash);
  if (!type) return null;

  const history = await processHistory(client, instanceHash);
  let nodeId: string | null = type.start;
  let currentTuple = opening.tuple_hash;
  let outcome: ProcessOutcome | null = null;

  for (const row of history) {
    if (row.tuple_hash === opening.tuple_hash) continue;
    const envelope = object(row.act.envelope) ?? {};
    if (text(envelope.parent) !== currentTuple) continue;
    if (!nodeId) break;
    const node = type.nodes.get(nodeId);
    if (!node) break;
    const observed = outcomeFromStatus(row.act.status);
    if (!observed) continue;
    outcome = observed;
    currentTuple = row.tuple_hash;
    const target = branchFor(node, observed);
    nodeId = isTerminal(target) ? null : target;
  }

  const node = nodeId ? type.nodes.get(nodeId) ?? null : null;
  return {
    process_instance: instanceHash,
    process_type: type.registered_hash,
    process_id: type.process_id,
    opened_tuple: opening.tuple_hash,
    current_tuple: currentTuple,
    current_node: node?.id ?? null,
    responsible: node?.responsible ?? null,
    activity: node?.activity ?? null,
    status: node ? "open" : "closed",
    outcome,
  };
}

async function queueCustody(client: PgClient, state: ProcessCurrentState): Promise<CustodyQueueItem | null> {
  if (!state.current_node || !state.responsible || state.status !== "open") return null;
  const queueId = `custody:${crypto.randomUUID().replaceAll("-", "")}`;
  const inserted = await client.query<CustodyQueueItem>(
    `INSERT INTO public.runtime_custody_queue(
       queue_id,process_instance,node,responsible,source_tuple,status,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,'queued',now(),now())
     ON CONFLICT (process_instance,node,source_tuple) DO NOTHING
     RETURNING queue_id,process_instance,node,responsible,source_tuple,status,claimed_by,
       lease_until::text,created_at::text,updated_at::text`,
    [queueId, state.process_instance, state.current_node, state.responsible, state.current_tuple],
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = await client.query<CustodyQueueItem>(
    `SELECT queue_id,process_instance,node,responsible,source_tuple,status,claimed_by,
       lease_until::text,created_at::text,updated_at::text
     FROM public.runtime_custody_queue
     WHERE process_instance=$1 AND node=$2 AND source_tuple=$3 LIMIT 1`,
    [state.process_instance, state.current_node, state.current_tuple],
  );
  return existing.rows[0] ?? null;
}

async function closePriorCustody(client: PgClient, instanceHash: string, sourceTuple: string): Promise<void> {
  await client.query(
    `UPDATE public.runtime_custody_queue
     SET status='closed',claimed_by=null,lease_until=null,updated_at=now()
     WHERE process_instance=$1 AND source_tuple=$2 AND status <> 'closed'`,
    [instanceHash, sourceTuple],
  );
}

/** Post-append deterministic consequence. Never invents an Act; it only derives custody. */
export async function routeProcessReceipt(client: PgClient, receipt: Receipt) {
  const envelope = object(receipt.envelope) ?? {};
  const isOpening = receipt.did === "opened_process";
  const instanceHash = isOpening ? receipt.id : text(envelope.process);
  if (!instanceHash) return null;

  if (!isOpening) {
    const parent = text(envelope.parent);
    if (parent) await closePriorCustody(client, instanceHash, parent);
  }
  const state = await processCurrentState(client, instanceHash);
  if (!state) return null;
  const custody = await queueCustody(client, state);
  return { state, custody };
}

/**
 * Objective process-chain verification for the pre-append membrane.
 * This validates identity, parent continuity, and responsible authority only.
 */
export async function verifyProcessProposal(client: PgClient, fields: Record<string, unknown>): Promise<string[]> {
  const checks: string[] = [];
  const envelope = object(fields.envelope) ?? {};
  if (fields.did === "opened_process") {
    if (text(envelope.process)) throw new ProcessMachineError("opening_self_reference", "opened_process must not set envelope.process");
    if (text(envelope.parent)) throw new ProcessMachineError("opening_parent_forbidden", "opened_process must not set envelope.parent");
    const typeHash = text(fields.process_type);
    if (!HASH.test(typeHash)) throw new ProcessMachineError("process_type_hash_invalid", "opened_process requires AUX process_type as a 64-hex content hash");
    const type = await loadCustodyProcessTypeByHash(client, typeHash);
    if (!type) throw new ProcessMachineError("process_type_not_custody_routable", "process type is missing or has no explicit custody nodes", { process_type: typeHash });
    checks.push("opening_process_type_exists", "opening_has_no_self_reference");
    return checks;
  }

  const instanceHash = text(envelope.process);
  if (!instanceHash) return checks;
  const parent = text(envelope.parent);
  if (!HASH.test(parent)) throw new ProcessMachineError("process_parent_required", "process-bound Act requires envelope.parent as the previous tuple hash");
  const state = await processCurrentState(client, instanceHash);
  if (!state) throw new ProcessMachineError("process_instance_not_found", "envelope.process does not identify an openable process instance", { process_instance: instanceHash });
  if (state.status !== "open") throw new ProcessMachineError("process_already_closed", "process instance is already closed", { process_instance: instanceHash });
  if (state.current_tuple !== parent) {
    throw new ProcessMachineError("process_parent_not_current", "envelope.parent is not the current process tuple", {
      expected: state.current_tuple,
      observed: parent,
    });
  }
  if (state.responsible && text(fields.who) !== state.responsible) {
    throw new ProcessMachineError("process_responsible_mismatch", "process-bound Act who must equal the current responsible actor", {
      expected: state.responsible,
      observed: text(fields.who),
    });
  }
  const outcome = outcomeFromStatus(fields.status);
  if (!outcome) throw new ProcessMachineError("process_status_not_outcome", "process dispatch status must be exactly ok, doubt, or not");
  const type = await loadCustodyProcessTypeByHash(client, state.process_type);
  const node = state.current_node && type ? type.nodes.get(state.current_node) : null;
  if (!node) throw new ProcessMachineError("process_node_not_found", "current process node is unavailable");
  const target = branchFor(node, outcome);
  if (!isTerminal(target) && !type?.nodes.has(String(target))) {
    throw new ProcessMachineError("process_transition_not_found", "selected branch does not name a defined node", {
      node: node.id,
      outcome,
      target,
    });
  }
  checks.push("process_instance_exists", "process_parent_current", "process_responsible_current", "process_transition_permitted");
  return checks;
}

export async function listCustody(client: PgClient, responsible?: string, limit = 50) {
  const capped = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
  const result = responsible
    ? await client.query<CustodyQueueItem>(
      `SELECT queue_id,process_instance,node,responsible,source_tuple,status,claimed_by,
         lease_until::text,created_at::text,updated_at::text
       FROM public.runtime_custody_queue
       WHERE status='queued' AND responsible=$1
       ORDER BY created_at,queue_id LIMIT $2`,
      [responsible, capped],
    )
    : await client.query<CustodyQueueItem>(
      `SELECT queue_id,process_instance,node,responsible,source_tuple,status,claimed_by,
         lease_until::text,created_at::text,updated_at::text
       FROM public.runtime_custody_queue
       WHERE status='queued'
       ORDER BY created_at,queue_id LIMIT $1`,
      [capped],
    );
  return result.rows;
}
