import type { PgClient } from "./db";
import { getAct, getTupleAct } from "./db";
import { humanProcessTitle } from "./contracts";
import { custodyExecutorRunOnce, type CustodyExecutionResult } from "./custody-executor";
import {
  legacyCaseView,
  legacyExecutorRunOnce,
  legacyResumeGrantSources,
  type LegacyQueueItem,
} from "./legacy-runtime";
import { currentCustodies, currentCustody, type CurrentCustodyItem } from "./process-inspect";
import {
  loadCustodyProcessTypeByHash,
  processCurrentState,
  type ProcessCurrentState,
} from "./process-machine";
import type { Receipt } from "./receipt";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fingerprint(hash: unknown): string | null {
  return typeof hash === "string" && hash ? hash.slice(0, 8) : null;
}

function looksLikeHash(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function runtimeResponsible(responsible: string): boolean {
  return responsible === "runtime.executor" || /^runtime[.:]/.test(responsible);
}

function currentMatches(custody: CurrentCustodyItem, state: ProcessCurrentState | null): state is ProcessCurrentState {
  return Boolean(
    state
    && state.status === "open"
    && state.process_instance === custody.process_instance
    && state.current_node === custody.node
    && state.responsible === custody.responsible
    && state.current_tuple === custody.source_tuple,
  );
}

type OpeningRow = {
  content_hash: string;
  act: Receipt;
  inserted_at: string;
  last_activity: string;
};

async function openingRows(client: PgClient, limit: number): Promise<OpeningRow[]> {
  const capped = Math.max(1, Math.min(500, Math.trunc(limit) || 100));
  const result = await client.query<OpeningRow>(
    `SELECT o.content_hash,o.act,o.inserted_at::text,
       coalesce((
         SELECT max(c.inserted_at) FROM public.logline_acts c
         WHERE c.act->'envelope'->>'process'=o.content_hash
       ),o.inserted_at)::text AS last_activity
     FROM public.logline_acts o
     WHERE o.did='opened_process'
     ORDER BY last_activity DESC,o.tuple_hash DESC
     LIMIT $1`,
    [capped],
  );
  return result.rows;
}

async function processTitle(client: PgClient, state: ProcessCurrentState): Promise<string> {
  const type = await loadCustodyProcessTypeByHash(client, state.process_type);
  const declared = text(type?.definition.title ?? type?.definition.name);
  return humanProcessTitle(state.process_id, declared || null);
}

const ERROR_CODES = [
  "grant_unsigned",
  "signoff_signer_mismatch",
  "missing_required_grant",
  "grant_not_found",
  "grant_revoked",
  "grant_expired",
  "budget_exhausted",
  "missing_timeout",
  "missing_sandbox_scope",
  "missing_network_policy",
  "activity_not_registered",
  "evidence_obligation_unmet",
  "custody_source_missing",
  "custody_process_type_missing",
  "custody_node_missing",
] as const;

function custodyErrorCode(lastError: string | null): string {
  if (!lastError) return "process_custody";
  return ERROR_CODES.find((code) => lastError.includes(code)) ?? "custody_execution_error";
}

async function custodyPendency(
  client: PgClient,
  custody: CurrentCustodyItem,
  state: ProcessCurrentState,
) {
  const source = await getTupleAct(client, custody.source_tuple);
  const type = await loadCustodyProcessTypeByHash(client, state.process_type);
  const lastError = custody.last_error;
  const resolvedBy = runtimeResponsible(custody.responsible) ? "operator" as const : "user" as const;
  const code = custodyErrorCode(lastError);
  return {
    id: custody.process_instance,
    fingerprint: fingerprint(custody.process_instance),
    source_hash: custody.process_instance,
    source_fingerprint: fingerprint(custody.process_instance),
    process_id: state.process_id,
    process_instance: custody.process_instance,
    node: custody.node,
    responsible: custody.responsible,
    activity: state.activity,
    custody_status: custody.status,
    grant_id: source ? text(source.grant_id) || null : null,
    when: custody.updated_at,
    danger_tier: text(type?.definition.danger_tier) || "L0",
    missing: [],
    missing_evidence: [],
    code,
    message: lastError
      ? `A atividade ${state.activity ?? custody.node} não avançou: ${lastError}`
      : `A atividade ${state.activity ?? custody.node} está com ${custody.responsible}.`,
    action: resolvedBy === "user" ? "Continuar processo" : lastError ? "Resolver execução" : "Executar atividade",
    resolved_by: resolvedBy,
    known: true,
  };
}

async function currentPendencyProjection(client: PgClient, limit: number) {
  const custodyRows = await currentCustodies(client, Math.max(limit * 4, 50));
  const projected = [];
  for (const custody of custodyRows) {
    const state = await processCurrentState(client, custody.process_instance);
    if (!currentMatches(custody, state)) continue;
    if (runtimeResponsible(custody.responsible) && !custody.last_error) continue;
    projected.push(await custodyPendency(client, custody, state));
    if (projected.length >= limit) break;
  }
  return projected;
}

/**
 * Canonical current-work view. No lifecycle helper Acts and no runtime_queue state are
 * consulted: process law is replayed from opened_process + parent-linked Acts, while
 * current work comes from the ephemeral custody queue.
 */
export async function nowView(client: PgClient, limit = 20) {
  const [pendencies, openings] = await Promise.all([
    currentPendencyProjection(client, limit * 2),
    openingRows(client, Math.max(limit * 5, 100)),
  ]);

  const moving: Array<Record<string, unknown>> = [];
  const closedToday: Array<Record<string, unknown>> = [];
  const since = Date.now() - 24 * 60 * 60 * 1000;
  for (const opening of openings) {
    const state = await processCurrentState(client, opening.content_hash);
    if (!state) continue;
    const custody = state.status === "open" ? await currentCustody(client, state.process_instance) : null;
    if (state.status === "open" && custody && runtimeResponsible(custody.responsible) && !custody.last_error && moving.length < limit) {
      moving.push({
        source_hash: state.process_instance,
        fingerprint: fingerprint(state.process_instance),
        process_id: state.process_id,
        process_instance: state.process_instance,
        node: state.current_node,
        responsible: state.responsible,
        activity: state.activity,
        custody_status: custody.status,
        when: custody.updated_at,
      });
    }
    if (state.status === "closed" && Date.parse(opening.last_activity) >= since && closedToday.length < limit) {
      closedToday.push({
        source_hash: state.process_instance,
        result_hash: state.current_tuple,
        fingerprint: fingerprint(state.process_instance),
        process_id: state.process_id,
        process_instance: state.process_instance,
        when: opening.last_activity,
      });
    }
  }

  return {
    needs_you: pendencies.filter((item) => item.resolved_by === "user").slice(0, limit),
    needs_operator: pendencies.filter((item) => item.resolved_by === "operator").slice(0, limit),
    moving,
    closed_today: closedToday,
  };
}

export async function pendenciesView(client: PgClient, resolvedBy?: string, limit = 50) {
  let items = await currentPendencyProjection(client, limit);
  if (resolvedBy) items = items.filter((item) => item.resolved_by === resolvedBy);
  return { count: items.length, pendencies: items };
}

export type ProcessListItem = {
  hash: string;
  title: string;
  process_title: string;
  state: "registered" | "moving" | "waiting" | "closed";
  when: string | null;
  process_instance?: string;
  current_node?: string | null;
  responsible?: string | null;
};

export async function processesView(client: PgClient, limit = 100) {
  const rows = await openingRows(client, limit);
  const processes: ProcessListItem[] = [];
  for (const row of rows) {
    const state = await processCurrentState(client, row.content_hash);
    if (!state) continue;
    const custody = state.status === "open" ? await currentCustody(client, state.process_instance) : null;
    const processTitleText = await processTitle(client, state);
    const subject = text(row.act.this);
    const title = subject && !looksLikeHash(subject) ? subject : processTitleText;
    const projectedState: ProcessListItem["state"] = state.status === "closed"
      ? "closed"
      : custody && runtimeResponsible(custody.responsible) && !custody.last_error
        ? "moving"
        : custody
          ? "waiting"
          : "registered";
    processes.push({
      hash: state.process_instance,
      process_instance: state.process_instance,
      title,
      process_title: processTitleText,
      state: projectedState,
      when: row.last_activity,
      current_node: state.current_node,
      responsible: state.responsible,
    });
  }
  return { count: processes.length, processes };
}

async function canonicalCaseView(client: PgClient, hash: string) {
  const state = await processCurrentState(client, hash);
  if (!state) return null;
  const openingResult = await client.query<{ act: Receipt; tuple_hash: string }>(
    `SELECT act,tuple_hash FROM public.logline_acts
     WHERE content_hash=$1 AND did='opened_process'
     ORDER BY inserted_at,tuple_hash LIMIT 1`,
    [hash],
  );
  const opening = openingResult.rows[0];
  if (!opening) return null;
  const history = await client.query<{ content_hash: string; tuple_hash: string; act: Receipt; inserted_at: string }>(
    `SELECT content_hash,tuple_hash,act,inserted_at::text
     FROM public.logline_acts
     WHERE (content_hash=$1 AND did='opened_process') OR act->'envelope'->>'process'=$1
     ORDER BY inserted_at,tuple_hash`,
    [hash],
  );
  const processTitleText = await processTitle(client, state);
  const subject = text(opening.act.this);
  const title = subject && !looksLikeHash(subject) ? subject : processTitleText;
  const custody = state.status === "open" ? await currentCustody(client, hash) : null;
  const timeline = history.rows.map((row, index) => ({
    step: text(row.act.did) || (index === 0 ? "opened_process" : "act"),
    label: index === 0 ? "Processo aberto" : text(row.act.did) || "Act",
    when: row.act.when ?? row.inserted_at,
    hash: row.content_hash,
    tuple_hash: row.tuple_hash,
    fingerprint: fingerprint(row.content_hash),
    status: row.act.status ?? null,
  }));
  const slots = Object.fromEntries(["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"].map((key) => [key, opening.act[key] ?? ""]));
  const fields = Object.fromEntries(Object.entries(opening.act).filter(([key]) => !["id", "receipt_version", "json_canonicalization", "hashes", ...Object.keys(slots)].includes(key)));
  return {
    hash,
    fingerprint: fingerprint(hash),
    title,
    process_title: processTitleText,
    found: true,
    valid: true,
    legacy: false,
    slots,
    fields,
    timeline,
    came_from: [],
    produced: history.rows.slice(1).map((row) => ({ hash: row.content_hash, tuple_hash: row.tuple_hash, fingerprint: fingerprint(row.content_hash), did: row.act.did })),
    process_state: state,
    custody,
  };
}

export async function caseView(client: PgClient, hash: string) {
  return await canonicalCaseView(client, hash) ?? legacyCaseView(client, hash);
}

export async function candidatesView(client: PgClient, limit = 50) {
  const rows = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE status='candidate' ORDER BY inserted_at DESC,content_hash DESC LIMIT $1",
    [limit],
  );
  const candidates = rows.rows.map(({ act }) => ({ id: act.id, fingerprint: fingerprint(act.id), did: act.did, when: act.when, payload: act, citations: act.citations ?? [] }));
  return { count: candidates.length, candidates };
}

/** Custody executor owns canonical work; legacy queue runs only when no custody exists. */
export async function executorRunOnce(client: PgClient, worker = "api"): Promise<LegacyQueueItem | CustodyExecutionResult | null> {
  const custody = await custodyExecutorRunOnce(client, "runtime.executor", worker);
  if (custody) return custody;
  return legacyExecutorRunOnce(client, worker);
}

/**
 * WebAuthn signoff can immediately release a failed current custody lease. Compatibility
 * queue resumption remains isolated in legacy-runtime.ts.
 */
export async function resumeGrantSources(client: PgClient, grantId: string) {
  const custody = await client.query<{ queue_id: string }>(
    `UPDATE public.runtime_custody_queue q
     SET status='queued',claimed_by=null,lease_until=null,last_error=null,updated_at=now()
     WHERE q.status='claimed' AND q.last_error IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.logline_acts a
         WHERE a.tuple_hash=q.source_tuple AND a.act->>'grant_id'=$1
       )
     RETURNING q.queue_id`,
    [grantId],
  );
  const legacy = await legacyResumeGrantSources(client, grantId);
  return [...custody.rows.map((row) => row.queue_id), ...legacy];
}

/** Semantic content lookup remains available for non-process historical cases. */
export async function sourceAct(client: PgClient, hash: string) {
  return getAct(client, hash);
}
