import type { PgClient } from "./db";
import { appendAct, getAct } from "./db";
import { humanProcessTitle, loadContracts, REGISTERED_ADAPTERS, type ProcessContract } from "./contracts";
import { evaluate, type Evaluation } from "./evaluator";
import { renderMessage } from "./messages";
import { verifyGrantForExecution } from "./grants";
import type { Receipt } from "./receipt";

const PENDENCY_DIDS = ["doubt", "not_dispatched", "evidence_incomplete", "adapter_doubted"];
const CLOSED_DIDS = ["fechado", "llm.receipt"];

export type QueueItem = {
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

function value(receipt: Record<string, unknown>, key: string): string {
  const item = receipt[key];
  return item == null ? "" : String(item);
}

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
  item: QueueItem,
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

async function queueAdd(client: PgClient, sourceHash: string, processId: string, adapter: string): Promise<QueueItem> {
  const queueId = `queue:${crypto.randomUUID().replaceAll("-", "")}`;
  const inserted = await client.query<QueueItem>(
    `INSERT INTO public.runtime_queue(queue_id,source_hash,process_id,adapter,status,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'queued',now(),now())
     ON CONFLICT (source_hash,process_id,adapter) DO NOTHING
     RETURNING queue_id,source_hash,process_id,adapter,status,attempts,claimed_by,created_at::text,updated_at::text,result_hash,last_error`,
    [queueId, sourceHash, processId, adapter],
  );
  let item = inserted.rows[0];
  if (!item) {
    const existing = await client.query<QueueItem>(
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

export async function receiverSelect(client: PgClient, frequency: string, limit = 50) {
  const catalog = await loadContracts(client);
  const rows = await client.query<{ content_hash: string; act: Receipt }>(
    "SELECT content_hash,act FROM public.logline_acts WHERE if_ok=$1 ORDER BY inserted_at,content_hash LIMIT $2",
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

async function claim(client: PgClient, worker: string): Promise<QueueItem | null> {
  const result = await client.query<QueueItem>(
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

async function closeQueue(client: PgClient, queueId: string, resultHash: string): Promise<QueueItem> {
  const result = await client.query<QueueItem>(
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

async function closeWithoutDispatch(client: PgClient, item: QueueItem, decision: Evaluation, worker: string): Promise<QueueItem> {
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

export async function executorRunOnce(client: PgClient, worker = "api"): Promise<QueueItem | null> {
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

    if (item.adapter !== "receipt") {
      return closeWithoutDispatch(client, item, blockedAdapter(decision), worker);
    }

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

function fingerprint(hash: unknown): string | null {
  return typeof hash === "string" && hash ? hash.slice(0, 8) : null;
}

function pendency(receipt: Receipt) {
  const reason = value(receipt, "reason") || "unknown";
  const evaluation = receipt.evaluation && typeof receipt.evaluation === "object" ? receipt.evaluation as Record<string, unknown> : null;
  return {
    id: receipt.id,
    fingerprint: fingerprint(receipt.id),
    source_hash: receipt.this ?? null,
    source_fingerprint: fingerprint(receipt.this),
    process_id: receipt.process_id ?? null,
    grant_id: receipt.grant_id ?? evaluation?.grant_id ?? null,
    when: receipt.when ?? null,
    danger_tier: receipt.danger_tier ?? null,
    missing: receipt.missing_aux ?? receipt.missing_slots ?? [],
    missing_evidence: receipt.missing_evidence ?? [],
    ...renderMessage(reason, receipt),
  };
}

export async function nowView(client: PgClient, limit = 20) {
  const pendingRows = await client.query<{ act: Receipt }>(
    `SELECT act FROM (
       SELECT DISTINCT ON (p.this) p.act,p.inserted_at,p.content_hash,p.this
       FROM public.logline_acts p
       WHERE p.did=ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM public.logline_acts n
           WHERE n.inserted_at > p.inserted_at
             AND (
               (n.this=p.this AND n.did=ANY($2::text[]))
               OR (n.act->'citations' ? p.this)
             )
         )
       ORDER BY p.this,p.inserted_at DESC,p.content_hash DESC
     ) current_pendencies
     ORDER BY inserted_at DESC,content_hash DESC LIMIT $3`,
    [PENDENCY_DIDS, ["queued", "dispatching", ...CLOSED_DIDS], limit],
  );
  const pending = pendingRows.rows.map((row) => pendency(row.act));
  const lifecycleDids = [...PENDENCY_DIDS, "queued", "dispatching", ...CLOSED_DIDS];
  const movingRows = await client.query<{ act: Receipt }>(
    `SELECT act FROM (
       SELECT DISTINCT ON (this) act,did,inserted_at,content_hash,this
       FROM public.logline_acts
       WHERE did=ANY($1::text[])
       ORDER BY this,inserted_at DESC,content_hash DESC
     ) latest
     WHERE did=ANY($2::text[])
     ORDER BY inserted_at DESC,content_hash DESC LIMIT $3`,
    [lifecycleDids, ["queued", "dispatching"], limit],
  );
  const closedRows = await client.query<{ act: Receipt }>(
    `SELECT act FROM (
       SELECT DISTINCT ON (this) act,did,inserted_at,content_hash,this
       FROM public.logline_acts
       WHERE did=ANY($1::text[])
       ORDER BY this,inserted_at DESC,content_hash DESC
     ) latest
     WHERE did=ANY($2::text[]) AND inserted_at >= now()-interval '24 hours'
     ORDER BY inserted_at DESC,content_hash DESC LIMIT $3`,
    [lifecycleDids, CLOSED_DIDS, limit],
  );
  return {
    needs_you: pending.filter((item) => item.resolved_by === "user"),
    needs_operator: pending.filter((item) => item.resolved_by === "operator"),
    moving: movingRows.rows.map(({ act }) => ({ source_hash: act.this ?? null, fingerprint: fingerprint(act.this), process_id: act.process_id ?? null, when: act.when ?? null })),
    closed_today: closedRows.rows.map(({ act }) => ({ source_hash: act.this ?? null, result_hash: act.id, fingerprint: fingerprint(act.id), process_id: act.process_id ?? null, when: act.when ?? null })),
  };
}

export async function pendenciesView(client: PgClient, resolvedBy?: string, limit = 50) {
  const rows = await client.query<{ act: Receipt }>(
    `SELECT act FROM (
       SELECT DISTINCT ON (p.this) p.act,p.inserted_at,p.content_hash,p.this
       FROM public.logline_acts p
       WHERE p.did=ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM public.logline_acts n
           WHERE n.inserted_at > p.inserted_at
             AND (
               (n.this=p.this AND n.did=ANY($2::text[]))
               OR (n.act->'citations' ? p.this)
             )
         )
       ORDER BY p.this,p.inserted_at DESC,p.content_hash DESC
     ) current_pendencies
     ORDER BY inserted_at DESC,content_hash DESC LIMIT $3`,
    [PENDENCY_DIDS, ["queued", "dispatching", ...CLOSED_DIDS], limit],
  );
  let items = rows.rows.map((row) => pendency(row.act));
  if (resolvedBy) items = items.filter((item) => item.resolved_by === resolvedBy);
  return { count: items.length, pendencies: items };
}

const TIMELINE_LABELS: Record<string, string> = {
  queued: "Na fila", dispatching: "Executando", fechado: "Concluído", "llm.receipt": "Concluído",
  doubt: "Parado", not_dispatched: "Parado", evidence_incomplete: "Parado sem comprovação", adapter_doubted: "Parado",
};

export async function caseView(client: PgClient, hash: string) {
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
    const entry: Record<string, unknown> = { step: did, label: TIMELINE_LABELS[did] ?? "Atualização", when: act.when, hash: act.id, fingerprint: fingerprint(act.id) };
    if (PENDENCY_DIDS.includes(did)) Object.assign(entry, renderMessage(value(act, "reason") || "unknown", act));
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
    slots,
    fields,
    timeline,
    came_from: [],
    produced: descendants.rows.map(({ act }) => ({ hash: act.id, fingerprint: fingerprint(act.id), did: act.did })),
  };
}

export async function candidatesView(client: PgClient, limit = 50) {
  const rows = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE status='candidate' ORDER BY inserted_at DESC,content_hash DESC LIMIT $1",
    [limit],
  );
  const candidates = rows.rows.map(({ act }) => ({ id: act.id, fingerprint: fingerprint(act.id), did: act.did, when: act.when, payload: act, citations: act.citations ?? [] }));
  return { count: candidates.length, candidates };
}


const PROCESS_INTERNAL_DIDS = [
  "authority", "authority-revoke", "authenticator-enroll", "authenticator-revoke", "authenticator-counter",
  "grant", "grant-revoke", "grant-signoff", "queued", "dispatching", "doubt", "not_dispatched",
  "adapter_doubted", "evidence_incomplete", "fechado", "llm.receipt",
];

export type ProcessListItem = {
  hash: string;
  title: string;
  process_title: string;
  state: "registered" | "moving" | "waiting" | "closed";
  when: string | null;
};

function looksLikeHash(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export async function processesView(client: PgClient, limit = 100) {
  const rows = await client.query<{
    content_hash: string;
    act: Receipt;
    process_id: string;
    process_title: string;
    inserted_at: string;
    latest_did: string | null;
  }>(
    `SELECT a.content_hash,a.act,pc.process_id,pc.title AS process_title,a.inserted_at::text,latest.did AS latest_did
     FROM public.logline_acts a
     JOIN public.process_contracts pc ON pc.process_id = a.act->>'process_id'
     LEFT JOIN LATERAL (
       SELECT d.did
       FROM public.logline_acts d
       WHERE d.this=a.content_hash
         AND d.did=ANY($1::text[])
       ORDER BY d.inserted_at DESC,d.content_hash DESC
       LIMIT 1
     ) latest ON true
     WHERE NOT (a.did=ANY($2::text[]))
     ORDER BY a.inserted_at DESC,a.content_hash DESC
     LIMIT $3`,
    [[...PENDENCY_DIDS, "queued", "dispatching", ...CLOSED_DIDS], PROCESS_INTERNAL_DIDS, limit],
  );
  const processes: ProcessListItem[] = rows.rows.map((row) => {
    const did = row.latest_did ?? "";
    const state: ProcessListItem["state"] = CLOSED_DIDS.includes(did)
      ? "closed"
      : PENDENCY_DIDS.includes(did)
        ? "waiting"
        : did === "queued" || did === "dispatching"
          ? "moving"
          : "registered";
    const processTitle = humanProcessTitle(row.process_id, row.process_title);
    const subject = String(row.act.this ?? "").trim();
    const title = subject && !looksLikeHash(subject) ? subject : processTitle;
    return { hash: row.content_hash, title, process_title: processTitle, state, when: row.act.when ? String(row.act.when) : row.inserted_at };
  });
  return { count: processes.length, processes };
}


export async function resumeGrantSources(client: PgClient, grantId: string) {
  const sources = await client.query<{ content_hash: string }>(
    "SELECT content_hash FROM public.logline_acts WHERE act->>'grant_id'=$1 ORDER BY inserted_at,content_hash",
    [grantId],
  );
  const resumed: string[] = [];
  for (const source of sources.rows) {
    const queueRows = await client.query<QueueItem & { result_did: string | null; result_reason: string | null }>(
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
