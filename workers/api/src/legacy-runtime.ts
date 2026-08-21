import type { PgClient } from "./db";
import { appendAct, getAct } from "./db";
import { humanProcessTitle, loadContracts, REGISTERED_ADAPTERS, type ProcessContract } from "./contracts";
import { evaluate, type Evaluation } from "./evaluator";
import { renderMessage } from "./messages";
import { verifyGrantForExecution } from "./grants";
import type { Receipt } from "./receipt";

/**
 * Compatibility runtime for pre-custody process_id/adapter contracts.
 *
 * Canonical v1.2 process instances MUST NOT enter this module. All runtime_queue SQL
 * lives here so the compatibility boundary is explicit and mechanically searchable.
 */
export type LegacyQueueItem = {
  queue_id: string;
  source_hash: string;
  process_id: string;
  adapter: string;
  status: string;
  attempts: number;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
  result_hash: string | null;
  last_error: string | null;
};

function blockedAdapter(decision: Evaluation): Evaluation {
  return { ...decision, activate: false, queueable: false, activation_state: "doubted", reason: "adapter_not_registered" };
}

const ADAPTER_ACU_COST: Record<string, number> = {
  worker_run: 1,
  workflow_run: 1,
};

async function dangerousControlDecision(
  client: PgClient,
  source: Receipt,
  item: LegacyQueueItem,
  decision: Evaluation,
): Promise<Evaluation | null> {
  if (decision.danger_tier !== "L4" && decision.danger_tier !== "L5") return null;
  const adapter = String(decision.adapter ?? item.adapter ?? "");
  const requiredAcu = ADAPTER_ACU_COST[adapter] ?? 1;
  const grantId = String(source.grant_id ?? "");
  let reason = "missing_required_grant";
  if (grantId) {
    const check = await verifyGrantForExecution(client, grantId, {
      source,
      processId: item.process_id,
      effectiveAdapter: adapter || null,
      requiredAcu,
      allowedWho: Array.isArray(decision.allowed_who)
        ? decision.allowed_who.filter((value): value is string => typeof value === "string")
        : [],
    });
    if (check.ok) return null;
    reason = check.reason;
  }
  return {
    ...decision,
    activate: false,
    queueable: false,
    activation_state: "doubted",
    reason,
    budget_required: requiredAcu,
    grant_id: grantId || null,
  };
}

async function existingDoubt(client: PgClient, sourceHash: string): Promise<Receipt | null> {
  const result = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE did='doubt' AND this=$1 ORDER BY inserted_at,content_hash LIMIT 1",
    [sourceHash],
  );
  return result.rows[0]?.act ?? null;
}

async function raiseDoubt(client: PgClient, sourceHash: string, decision: Evaluation, frequency?: string): Promise<Receipt> {
  const existing = await existingDoubt(client, sourceHash);
  if (existing) return existing;
  return appendAct(client, {
    who: "runtime.receiver",
    did: "doubt",
    this: sourceHash,
    when: new Date().toISOString(),
    confirmed_by: "lab.runtime",
    if_ok: "attention-raise.v1",
    if_doubt: "attention-raise.v1",
    if_not: "executor.skip",
    status: "doubted",
    reason: decision.reason,
    activation_state: decision.activation_state,
    missing_slots: decision.missing_slots,
    missing_aux: decision.missing_aux,
    danger_tier: decision.danger_tier,
    process_id: decision.process_id,
    evaluation: decision,
    ...(frequency ? { frequency } : {}),
  });
}

async function queueAdd(client: PgClient, sourceHash: string, processId: string, adapter: string): Promise<LegacyQueueItem> {
  const queueId = `queue:${crypto.randomUUID().replaceAll("-", "")}`;
  const inserted = await client.query<LegacyQueueItem>(
    `INSERT INTO public.runtime_queue(queue_id,source_hash,process_id,adapter,status,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'queued',now(),now())
     ON CONFLICT (source_hash,process_id,adapter) DO NOTHING
     RETURNING queue_id,source_hash,process_id,adapter,status,attempts,claimed_by,created_at::text,updated_at::text,result_hash,last_error`,
    [queueId, sourceHash, processId, adapter],
  );
  let item = inserted.rows[0];
  if (!item) {
    const existing = await client.query<LegacyQueueItem>(
      `SELECT queue_id,source_hash,process_id,adapter,status,attempts,claimed_by,created_at::text,updated_at::text,result_hash,last_error
       FROM public.runtime_queue WHERE source_hash=$1 AND process_id=$2 AND adapter=$3`,
      [sourceHash, processId, adapter],
    );
    item = existing.rows[0];
  } else {
    await appendAct(client, {
      who: "runtime.receiver",
      did: "queued",
      this: sourceHash,
      when: new Date().toISOString(),
      confirmed_by: "lab.runtime",
      if_ok: adapter,
      if_doubt: "attention-raise.v1",
      if_not: "executor.failed",
      status: "queued",
      process_id: processId,
      queue_id: item.queue_id,
      adapter,
    });
  }
  if (!item) throw new Error("runtime queue insert did not return an item");
  return item;
}

export async function legacyReceiverSelect(client: PgClient, frequency: string, limit = 50) {
  const catalog = await loadContracts(client);
  const rows = await client.query<{ content_hash: string; act: Receipt }>(
    `SELECT content_hash,act
     FROM public.logline_acts
     WHERE act->>'process_id'=$1
       AND coalesce(act->'envelope'->>'process','')=''
       AND did <> 'opened_process'
     ORDER BY inserted_at,content_hash LIMIT $2`,
    [frequency, limit],
  );
  const selected = [];
  for (const row of rows.rows) {
    let decision = evaluate(row.act, catalog);
    const adapter = decision.adapter ? String(decision.adapter) : "";
    if (decision.activate && !REGISTERED_ADAPTERS.has(adapter)) decision = blockedAdapter(decision);
    const queued = decision.activate && decision.process_id && adapter
      ? await queueAdd(client, row.content_hash, String(decision.process_id), adapter)
      : null;
    const doubt = decision.activate ? null : await raiseDoubt(client, row.content_hash, decision, frequency);
    selected.push({ hash: row.content_hash, evaluation: decision, queued, doubt: doubt?.id ?? null });
  }
  return selected;
}

async function claim(client: PgClient, worker: string): Promise<LegacyQueueItem | null> {
  const result = await client.query<LegacyQueueItem>(
    `WITH next AS (
       SELECT queue_id FROM public.runtime_queue
       WHERE status='queued'
       ORDER BY created_at,queue_id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE public.runtime_queue q
       SET status='claimed', claimed_by=$1, attempts=q.attempts+1, updated_at=now()
     FROM next
     WHERE q.queue_id=next.queue_id
     RETURNING q.queue_id,q.source_hash,q.process_id,q.adapter,q.status,q.attempts,q.claimed_by,q.created_at::text,q.updated_at::text,q.result_hash,q.last_error`,
    [worker],
  );
  return result.rows[0] ?? null;
}

async function closeQueue(client: PgClient, queueId: string, resultHash: string): Promise<LegacyQueueItem> {
  const result = await client.query<LegacyQueueItem>(
    `UPDATE public.runtime_queue SET status='closed',result_hash=$2,updated_at=now()
     WHERE queue_id=$1
     RETURNING queue_id,source_hash,process_id,adapter,status,attempts,claimed_by,created_at::text,updated_at::text,result_hash,last_error`,
    [queueId, resultHash],
  );
  if (!result.rows[0]) throw new Error(`queue item not found: ${queueId}`);
  return result.rows[0];
}

async function failQueue(client: PgClient, queueId: string, error: string): Promise<void> {
  await client.query("UPDATE public.runtime_queue SET status='failed',last_error=$2,updated_at=now() WHERE queue_id=$1", [queueId, error.slice(0, 1000)]);
}

async function closeWithoutDispatch(client: PgClient, item: LegacyQueueItem, decision: Evaluation, worker: string): Promise<LegacyQueueItem> {
  const result = await appendAct(client, {
    who: "runtime.executor",
    did: "not_dispatched",
    this: item.source_hash,
    when: new Date().toISOString(),
    confirmed_by: worker,
    if_ok: "attention-raise.v1",
    if_doubt: "attention-raise.v1",
    if_not: "executor.skip",
    status: decision.activation_state === "ativável" ? "doubted" : String(decision.activation_state ?? "doubted"),
    process_id: item.process_id,
    queue_id: item.queue_id,
    adapter: item.adapter,
    reason: decision.reason,
    missing_slots: decision.missing_slots,
    missing_aux: decision.missing_aux,
    danger_tier: decision.danger_tier,
    evaluation: decision,
  });
  return closeQueue(client, item.queue_id, result.id);
}

export async function legacyExecutorRunOnce(client: PgClient, worker = "api"): Promise<LegacyQueueItem | null> {
  const item = await claim(client, worker);
  if (!item) return null;
  try {
    const source = await getAct(client, item.source_hash);
    if (!source) throw new Error(`source act not found: ${item.source_hash}`);
    const catalog = await loadContracts(client);
    let decision = evaluate(source, catalog, item.process_id);
    if (!decision.activate) return closeWithoutDispatch(client, item, decision, worker);
    const dangerousDecision = await dangerousControlDecision(client, source, item, decision);
    if (dangerousDecision) return closeWithoutDispatch(client, item, dangerousDecision, worker);
    if (String(decision.adapter ?? "") !== item.adapter) {
      decision = { ...decision, activate: false, queueable: false, activation_state: "doubted", reason: "dispatch_mismatch", queued_adapter: item.adapter, expected_adapter: decision.adapter };
      return closeWithoutDispatch(client, item, decision, worker);
    }
    if (!REGISTERED_ADAPTERS.has(item.adapter)) return closeWithoutDispatch(client, item, blockedAdapter(decision), worker);

    await appendAct(client, {
      who: "runtime.executor",
      did: "dispatching",
      this: item.source_hash,
      when: new Date().toISOString(),
      confirmed_by: worker,
      if_ok: item.adapter,
      if_doubt: "attention-raise.v1",
      if_not: "executor.failed",
      status: "processando",
      process_id: item.process_id,
      queue_id: item.queue_id,
      adapter: item.adapter,
    });

    if (item.adapter !== "receipt") return closeWithoutDispatch(client, item, blockedAdapter(decision), worker);

    const adapterAux = {
      adapter_class: "internal.receipt",
      source_hash: source.id,
      source_status: source.status ?? "missing",
      external_effect: false,
    };
    const contract: ProcessContract | undefined = catalog.get(item.process_id);
    const gaps = (contract?.evidence_must_include ?? []).filter((field) => {
      const current = adapterAux[field as keyof typeof adapterAux];
      return current == null || current === "";
    });
    if (gaps.length) {
      const result = await appendAct(client, {
        who: "runtime.executor", did: "evidence_incomplete", this: item.source_hash, when: new Date().toISOString(),
        confirmed_by: worker, if_ok: "attention-raise.v1", if_doubt: "attention-raise.v1", if_not: "executor.failed",
        status: "doubted", process_id: item.process_id, queue_id: item.queue_id, adapter: item.adapter,
        reason: "evidence_obligation_unmet", evidence_must_include: contract?.evidence_must_include ?? [], missing_evidence: gaps, ...adapterAux,
      });
      return closeQueue(client, item.queue_id, result.id);
    }

    const result = await appendAct(client, {
      who: "runtime.executor",
      did: "fechado",
      this: item.source_hash,
      when: new Date().toISOString(),
      confirmed_by: worker,
      if_ok: "evidence-closure.v1",
      if_doubt: "attention-raise.v1",
      if_not: "executor.failed",
      status: "fechado",
      process_id: item.process_id,
      queue_id: item.queue_id,
      adapter: item.adapter,
      ...adapterAux,
    });
    return closeQueue(client, item.queue_id, result.id);
  } catch (error) {
    await failQueue(client, item.queue_id, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function value(receipt: Record<string, unknown>, key: string): string {
  const item = receipt[key];
  return item == null ? "" : String(item);
}

function fingerprint(hash: unknown): string | null {
  return typeof hash === "string" && hash ? hash.slice(0, 8) : null;
}

const LEGACY_PENDENCY_DIDS = ["doubt", "not_dispatched", "evidence_incomplete", "adapter_doubted"];
const LEGACY_TIMELINE_LABELS: Record<string, string> = {
  queued: "Na fila", dispatching: "Executando", fechado: "Concluído", "llm.receipt": "Concluído",
  doubt: "Parado", not_dispatched: "Parado", evidence_incomplete: "Parado sem comprovação", adapter_doubted: "Parado",
};

/** Historical case fallback for pre-opened_process Acts only. */
export async function legacyCaseView(client: PgClient, hash: string) {
  const source = await getAct(client, hash);
  if (!source) return null;
  const processId = String(source.process_id ?? "");
  const contractResult = processId
    ? await client.query<{ title: string }>("SELECT title FROM public.process_contracts WHERE process_id=$1 LIMIT 1", [processId])
    : { rows: [] as Array<{ title: string }> };
  const processTitle = humanProcessTitle(processId, contractResult.rows[0]?.title);
  const subject = String(source.this ?? "").trim();
  const humanTitle = subject && !/^[0-9a-f]{64}$/i.test(subject) ? subject : processTitle;
  const descendants = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE this=$1 ORDER BY inserted_at,content_hash",
    [hash],
  );
  const timeline: Array<Record<string, unknown>> = [{ step: "registered", label: "Registrado", when: source.when, hash, fingerprint: fingerprint(hash) }];
  for (const { act } of descendants.rows) {
    const did = value(act, "did");
    const entry: Record<string, unknown> = { step: did, label: LEGACY_TIMELINE_LABELS[did] ?? "Atualização", when: act.when, hash: act.id, fingerprint: fingerprint(act.id) };
    if (LEGACY_PENDENCY_DIDS.includes(did)) Object.assign(entry, renderMessage(value(act, "reason") || "unknown", act));
    timeline.push(entry);
  }
  const slots = Object.fromEntries(["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"].map((key) => [key, source[key] ?? ""]));
  const fields = Object.fromEntries(Object.entries(source).filter(([key]) => !["id", "receipt_version", "json_canonicalization", "hashes", ...Object.keys(slots)].includes(key)));
  return {
    hash,
    fingerprint: fingerprint(hash),
    title: humanTitle,
    process_title: processTitle,
    found: true,
    valid: true,
    legacy: true,
    slots,
    fields,
    timeline,
    came_from: [],
    produced: descendants.rows.map(({ act }) => ({ hash: act.id, fingerprint: fingerprint(act.id), did: act.did })),
  };
}

/** Resume only compatibility queue items after WebAuthn signoff. */
export async function legacyResumeGrantSources(client: PgClient, grantId: string) {
  const sources = await client.query<{ content_hash: string }>(
    "SELECT content_hash FROM public.logline_acts WHERE act->>'grant_id'=$1 ORDER BY inserted_at,content_hash",
    [grantId],
  );
  const resumed: string[] = [];
  for (const source of sources.rows) {
    const queueRows = await client.query<LegacyQueueItem & { result_did: string | null; result_reason: string | null }>(
      `SELECT q.queue_id,q.source_hash,q.process_id,q.adapter,q.status,q.attempts,q.claimed_by,q.created_at::text,q.updated_at::text,q.result_hash,q.last_error,
              r.did AS result_did,r.act->>'reason' AS result_reason
       FROM public.runtime_queue q
       LEFT JOIN public.logline_acts r ON r.content_hash=q.result_hash
       WHERE q.source_hash=$1 AND q.status IN ('closed','failed')`,
      [source.content_hash],
    );
    for (const item of queueRows.rows) {
      if (item.result_did !== "not_dispatched" || !["grant_unsigned", "signoff_signer_mismatch"].includes(String(item.result_reason ?? ""))) continue;
      const updated = await client.query(
        `UPDATE public.runtime_queue
         SET status='queued',claimed_by=NULL,result_hash=NULL,last_error=NULL,updated_at=now()
         WHERE queue_id=$1 AND status IN ('closed','failed')`,
        [item.queue_id],
      );
      if (!updated.rowCount) continue;
      await appendAct(client, {
        who: "runtime.receiver",
        did: "queued",
        this: item.source_hash,
        when: new Date().toISOString(),
        confirmed_by: "webauthn.signoff",
        if_ok: item.adapter,
        if_doubt: "attention-raise.v1",
        if_not: "executor.failed",
        status: "queued",
        process_id: item.process_id,
        queue_id: item.queue_id,
        adapter: item.adapter,
        reason: "grant_signoff_verified",
      });
      resumed.push(item.queue_id);
    }
  }
  return resumed;
}
