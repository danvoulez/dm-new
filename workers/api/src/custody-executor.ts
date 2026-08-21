import { CUSTODY_ACTIVITY_HANDLERS, type CustodyActivityHandler } from "./custody-activities";
import { effectiveDangerTier } from "./contracts";
import { appendAct, getTupleAct, type PgClient } from "./db";
import { evaluate } from "./evaluator";
import { verifyGrantForExecution } from "./grants";
import {
  loadCustodyProcessTypeByHash,
  outcomeFromStatus,
  processCurrentState,
  routeProcessReceipt,
  type CustodyProcessType,
  type CustodyQueueItem,
  type ProcessCurrentState,
} from "./process-machine";
import { registerFlow } from "./register-flow";
import { SLOTS, type ActFields, type Receipt } from "./receipt";

export type ExecutableCustodyItem = CustodyQueueItem & {
  attempts: number;
  last_error: string | null;
  result_tuple: string | null;
};

export type CustodyExecutionResult = {
  kind: "custody";
  queue: ExecutableCustodyItem;
  process_instance: string;
  node: string;
  responsible: string;
  activity: string;
  result_content_hash: string;
  result_tuple: string;
};

export class CustodyExecutionError extends Error {
  readonly code: string;
  readonly queue?: ExecutableCustodyItem;
  readonly detail?: Record<string, unknown>;

  constructor(code: string, message: string, options: { queue?: ExecutableCustodyItem; detail?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "CustodyExecutionError";
    this.code = code;
    this.queue = options.queue;
    this.detail = options.detail;
  }
}

type ClaimedCurrent = {
  queue: ExecutableCustodyItem;
  state: ProcessCurrentState;
};

type CustodyExecutorDeps = {
  project: typeof processCurrentState;
  sourceByTuple: typeof getTupleAct;
  loadType: typeof loadCustodyProcessTypeByHash;
  verifyGrant: typeof verifyGrantForExecution;
  activities: Map<string, CustodyActivityHandler>;
  appendProposal: (client: PgClient, proposal: ActFields, responsible: string) => Promise<Receipt>;
  now: () => string;
};

const DEFAULT_DEPS: CustodyExecutorDeps = {
  project: processCurrentState,
  sourceByTuple: getTupleAct,
  loadType: loadCustodyProcessTypeByHash,
  verifyGrant: verifyGrantForExecution,
  activities: CUSTODY_ACTIVITY_HANDLERS,
  appendProposal: appendCustodyProposal,
  now: () => new Date().toISOString(),
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function currentMatches(queue: ExecutableCustodyItem, state: ProcessCurrentState | null): state is ProcessCurrentState {
  return Boolean(
    state
    && state.status === "open"
    && state.process_instance === queue.process_instance
    && state.current_node === queue.node
    && state.responsible === queue.responsible
    && state.current_tuple === queue.source_tuple,
  );
}

function assertOwnedProposal(proposal: ActFields, claim: ClaimedCurrent): void {
  for (const slot of SLOTS) {
    if (!(slot in proposal) || typeof proposal[slot] !== "string") {
      throw new CustodyExecutionError("activity_proposal_incomplete", `custody activity must author slot ${slot}`, { queue: claim.queue });
    }
  }
  const envelope = object(proposal.envelope);
  if (!envelope) throw new CustodyExecutionError("activity_envelope_missing", "custody activity must author an envelope object", { queue: claim.queue });
  if (text(proposal.who) !== claim.queue.responsible) {
    throw new CustodyExecutionError("activity_actor_mismatch", "custody activity who must equal current responsible", { queue: claim.queue });
  }
  if (text(envelope.process) !== claim.queue.process_instance || text(envelope.parent) !== claim.queue.source_tuple) {
    throw new CustodyExecutionError("activity_process_context_mismatch", "custody activity must preserve process instance and exact source tuple parent", { queue: claim.queue });
  }
  if (!outcomeFromStatus(proposal.status)) {
    throw new CustodyExecutionError("activity_outcome_invalid", "custody activity status must be exactly ok, doubt, or not", { queue: claim.queue });
  }
}

function evidenceGaps(type: CustodyProcessType, proposal: ActFields): string[] {
  return strings(type.definition.evidence_must_include).filter((field) => {
    const value = proposal[field];
    return value === undefined || value === null || value === "";
  });
}

async function appendCustodyProposal(client: PgClient, proposal: ActFields, responsible: string): Promise<Receipt> {
  const outcome = await registerFlow(client, proposal, {
    append: appendAct,
    loadCatalog: async () => {
      throw new Error("custody executor lost custody route ownership");
    },
    evaluateReceipt: evaluate,
    selectReceiver: async () => {
      throw new Error("custody executor must not enter legacy receiver selection");
    },
    routeProcessReceipt,
  }, { identity: responsible });
  return outcome.receipt;
}

/**
 * Atomic lease claim for one responsible actor. Expired claims are reclaimable; live
 * claims are never stolen. The subsequent projection check rejects stale queue rows.
 */
export async function claimCustody(
  client: PgClient,
  responsible: string,
  worker: string,
  leaseSeconds = 60,
): Promise<ExecutableCustodyItem | null> {
  const lease = Math.max(5, Math.min(900, Math.trunc(leaseSeconds) || 60));
  const result = await client.query<ExecutableCustodyItem>(
    `WITH next AS (
       SELECT queue_id
       FROM public.runtime_custody_queue
       WHERE responsible=$1
         AND (
           status='queued'
           OR (status='claimed' AND (lease_until IS NULL OR lease_until <= now()))
         )
       ORDER BY created_at,queue_id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE public.runtime_custody_queue q
     SET status='claimed',
         claimed_by=$2,
         lease_until=now() + ($3::int * interval '1 second'),
         attempts=coalesce(q.attempts,0)+1,
         last_error=null,
         updated_at=now()
     FROM next
     WHERE q.queue_id=next.queue_id
     RETURNING q.queue_id,q.process_instance,q.node,q.responsible,q.source_tuple,q.status,
       q.claimed_by,q.lease_until::text,q.created_at::text,q.updated_at::text,
       q.attempts,q.last_error,q.result_tuple`,
    [responsible, worker, lease],
  );
  return result.rows[0] ?? null;
}

async function closeStaleClaim(client: PgClient, queueId: string, reason: string): Promise<void> {
  await client.query(
    `UPDATE public.runtime_custody_queue
     SET status='closed',claimed_by=null,lease_until=null,last_error=$2,updated_at=now()
     WHERE queue_id=$1`,
    [queueId, reason.slice(0, 1000)],
  );
}

async function recordExecutionError(client: PgClient, queueId: string, error: string): Promise<void> {
  await client.query(
    `UPDATE public.runtime_custody_queue
     SET last_error=$2,updated_at=now()
     WHERE queue_id=$1`,
    [queueId, error.slice(0, 1000)],
  );
}

async function recordExecutionResult(client: PgClient, queueId: string, resultTuple: string): Promise<void> {
  await client.query(
    `UPDATE public.runtime_custody_queue
     SET status='closed',claimed_by=null,lease_until=null,result_tuple=$2,last_error=null,updated_at=now()
     WHERE queue_id=$1`,
    [queueId, resultTuple],
  );
}

async function claimCurrentCustody(
  client: PgClient,
  responsible: string,
  worker: string,
  leaseSeconds: number,
  deps: CustodyExecutorDeps,
): Promise<ClaimedCurrent | null> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const queue = await claimCustody(client, responsible, worker, leaseSeconds);
    if (!queue) return null;
    const state = await deps.project(client, queue.process_instance);
    if (currentMatches(queue, state)) return { queue, state };
    await closeStaleClaim(client, queue.queue_id, "stale_custody_projection");
  }
  throw new CustodyExecutionError("stale_custody_limit", "too many stale custody rows while claiming work");
}

async function enforceSafety(
  client: PgClient,
  claim: ClaimedCurrent,
  source: Receipt,
  type: CustodyProcessType,
  activity: string,
  deps: CustodyExecutorDeps,
): Promise<void> {
  const declaredTier = text(type.definition.danger_tier) || "L0";
  const dangerTier = effectiveDangerTier(declaredTier, activity);
  if (dangerTier !== "L4" && dangerTier !== "L5") return;

  const grantId = text(source.grant_id);
  if (!grantId) {
    throw new CustodyExecutionError("missing_required_grant", "dangerous custody activity requires an explicit grant_id on the source Act", {
      queue: claim.queue,
      detail: { danger_tier: dangerTier, activity },
    });
  }
  const check = await deps.verifyGrant(client, grantId, {
    source,
    processId: claim.state.process_id,
    effectiveAdapter: activity,
    requiredAcu: 1,
    allowedWho: strings(type.definition.allowed_who),
  });
  if (!check.ok) {
    throw new CustodyExecutionError(check.reason, `custody activity grant rejected: ${check.reason}`, {
      queue: claim.queue,
      detail: { grant_id: grantId, danger_tier: dangerTier, activity },
    });
  }
}

/**
 * Run one unit of current custody for one responsible actor.
 *
 * claim -> re-project -> exact source tuple -> safety -> activity effect/scribe
 * -> verify-before-append -> deterministic process route -> close runtime claim.
 */
export async function custodyExecutorRunOnce(
  client: PgClient,
  responsible = "runtime.executor",
  worker = responsible,
  leaseSeconds = 60,
  overrides: Partial<CustodyExecutorDeps> = {},
): Promise<CustodyExecutionResult | null> {
  const deps: CustodyExecutorDeps = { ...DEFAULT_DEPS, ...overrides };
  const claim = await claimCurrentCustody(client, responsible, worker, leaseSeconds, deps);
  if (!claim) return null;

  try {
    const source = await deps.sourceByTuple(client, claim.queue.source_tuple);
    if (!source) {
      throw new CustodyExecutionError("custody_source_missing", "custody source_tuple does not identify an exact ledger occurrence", { queue: claim.queue });
    }
    const type = await deps.loadType(client, claim.state.process_type);
    if (!type) {
      throw new CustodyExecutionError("custody_process_type_missing", "custody process type version is unavailable", { queue: claim.queue });
    }
    const node = type.nodes.get(claim.queue.node);
    if (!node) {
      throw new CustodyExecutionError("custody_node_missing", "claimed custody node is absent from its immutable process type", { queue: claim.queue });
    }
    const activity = node.activity;
    const handler = deps.activities.get(activity);
    if (!handler) {
      throw new CustodyExecutionError("activity_not_registered", `no registered custody activity handler for ${activity}`, {
        queue: claim.queue,
        detail: { activity },
      });
    }

    await enforceSafety(client, claim, source, type, activity, deps);
    const proposal = await handler({ source, custody: claim.queue, state: claim.state, worker, now: deps.now() });
    assertOwnedProposal(proposal, claim);
    const gaps = evidenceGaps(type, proposal);
    if (gaps.length) {
      throw new CustodyExecutionError("evidence_obligation_unmet", "custody activity proposal is missing declared execution evidence", {
        queue: claim.queue,
        detail: { missing_evidence: gaps },
      });
    }

    const receipt = await deps.appendProposal(client, proposal, claim.queue.responsible);
    const resultTuple = receipt.hashes.tuple_hash;
    await recordExecutionResult(client, claim.queue.queue_id, resultTuple);
    return {
      kind: "custody",
      queue: { ...claim.queue, status: "closed", claimed_by: null, lease_until: null, result_tuple: resultTuple, last_error: null },
      process_instance: claim.queue.process_instance,
      node: claim.queue.node,
      responsible: claim.queue.responsible,
      activity,
      result_content_hash: receipt.hashes.content_hash,
      result_tuple: resultTuple,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordExecutionError(client, claim.queue.queue_id, message).catch(() => undefined);
    throw error;
  }
}
