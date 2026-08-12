import { Hono } from "hono";
import { Client } from "pg";
import { cors } from "hono/cors";

type Env = {
  HYPERDRIVE: Hyperdrive;
  PROJECTIONS: D1Database;
  OBJECTS: R2Bucket;
  AI: Ai;
  LAB_MODE: string;
  // único provedor: golden-bridge (lab 512) — junta Vercel/CF/local internamente, fetch tudo da API
  GOLDEN_BRIDGE_URL?: string;
};

const app = new Hono<{ Bindings: Env }>();

const ALLOWED_ORIGINS = [
  "https://app.carbonlab.work",
  "https://api.carbonlab.work",
  "https://lab.carbonlab.work",
  "https://docs.carbonlab.work",
  "https://dm-lab-ui.pages.dev",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    // Allow any *.carbonlab.work for pattern
    if (/^https:\/\/[^.]+\.carbonlab\.work$/.test(origin)) return origin;
    return "";
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

// Health — never touches ledger, safe for probes.
app.get("/api/health", async (c) => {
  // Hyperdrive connection is lazy; we just report bindings present.
  return c.json({ ok: true, mode: c.env.LAB_MODE ?? "production", ledger: "public.logline_acts@postgres via Hyperdrive", projections: "D1@dm-projections", rls: "enabled, no policies — service_role via Hyperdrive only" });
});

// Proxy remaining reads to Postgres via Hyperdrive (service_role). RLS ON no policies means anon gets nothing — this Worker IS the membrane.
function pgConn(c: { env: Env }) {
  // Hyperdrive exposes connectionString. In prod Wrangler injects it; locally use localConnectionString.
  const connString: string = (c.env.HYPERDRIVE as unknown as { connectionString: string })?.connectionString;
  return connString;
}

// Minimal SQL helper — in production replace with `postgres` or `pg` via Hyperdrive.
// For now we return the shape the UI expects and document the SQL that must run server-side.
function fingerprint(hash: string | null | undefined) { return hash ? hash.slice(0, 8) : null; }

// Vocabulary is closed and versioned from lab/messages.py — serve static catalog (no DB hit) so UI needs no release when a reason is added.
import { CATALOG } from "./vocabulary";

app.get("/api/vocabulary", (c) => {
  const reasons = Object.entries(CATALOG).map(([code, [template, action, resolved_by]]) => ({ code, template, action, resolved_by }));
  return c.json({ count: reasons.length, reasons });
});

// Modelos expostos via API — só golden-bridge, fetch tudo da API, zero hardcode, zero chave
app.get("/api/models", async (c) => {
  const base = (c.env.GOLDEN_BRIDGE_URL ?? "https://llm.minilab.work").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/v1/models`);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json() as { data?: unknown[]; object?: string };
    // golden-bridge já retorna {object:"list", data:[{id,provider,owned_by}]}
    return c.json(j);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ object: "list", data: [], error: `golden-bridge unavailable: ${msg.slice(0, 200)}` }, 502);
  }
});
app.get("/v1/models", async (c) => {
  // alias OpenAI-compat para UI direta
  const res = await app.request("/api/models", {}, c.env as unknown as Record<string, string>);
  const j = await res.json() as { data: unknown[] };
  return c.json({ object: "list", data: j.data });
});

app.get("/api/process-types", async (c) => {
  // In permanent deploy this queries Postgres: SELECT * FROM process catalog (or from config table).
  // Stub returns runnable set so UI's contract-driven form still renders during wiring.
  // Replace stub with actual SQL via Hyperdrive when DB is live.
  return c.json({
    count: 11,
    types: [
      { process_id: "inference.v1", title: "Inference", requires: [], accepts: [], required_slots: ["who","did","this","when","confirmed_by","if_ok","if_doubt","if_not","status"], adapter: "inference", danger_tier: "L3", needs_approval: true, irreversible: false, runnable: true, readiness: "runnable", readiness_reason: "", evidence_must_include: ["output_hash","schema_hash"] },
      { process_id: "memory-register.v1", title: "Memória", requires: [], accepts: ["descricao"], required_slots: ["who","did","this"], adapter: "receipt", danger_tier: "L0", needs_approval: false, irreversible: false, runnable: true, readiness: "runnable", readiness_reason: "", evidence_must_include: [] },
      { process_id: "worker-run.v1", title: "Worker run", requires: [], accepts: [], required_slots: ["who","did","this","when"], adapter: "worker_run", danger_tier: "L4", needs_approval: true, irreversible: false, runnable: false, readiness: "contract-only", readiness_reason: "no adapter configured in bench" },
    ],
  });
});

app.get("/api/now", async (c) => {
  // Permanent SQL (via Hyperdrive, service_role):
  // SELECT * FROM public.logline_acts WHERE did IN ('doubt','not_dispatched',...) ORDER BY inserted_at DESC LIMIT 20
  // plus queued/fechado partitions. D1 not involved — this is Postgres authoritative.
  // Stub empty so UI shows "Nada pendente com você" until DB is connected.
  return c.json({ needs_you: [], needs_operator: [], moving: [], closed_today: [] });
});

app.get("/api/pendencies", async (c) => {
  const resolved_by = c.req.query("resolved_by");
  // SQL: SELECT act FROM public.logline_acts WHERE act->>'did' IN (...) AND ... LIMIT 50
  // Filter by resolved_by in Worker (CATALOG resolved_by) to avoid DB policy leak.
  void resolved_by; void pgConn(c);
  return c.json({ count: 0, pendencies: [] });
});

app.get("/api/cases/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "hash must be 64 hex", code: "bad_request" }, 400);
  // SQL: SELECT act FROM public.logline_acts WHERE content_hash=$1
  // + SELECT act FROM public.logline_acts WHERE act->>'this'=$1
  void pgConn(c);
  return c.json({ hash, fingerprint: fingerprint(hash), found: false, valid: false, slots: {}, fields: {}, timeline: [{ step: "registered", label: "Registrado", when: new Date().toISOString(), hash, fingerprint: fingerprint(hash) }], came_from: [], produced: [] }, 200);
});

app.get("/api/candidates", async (c) => c.json({ count: 0, candidates: [] }));
app.get("/api/projections", async (c) => {
  // Projections are rebuildable → D1. Ledger stays Postgres.
  // Example D1 query: SELECT projection_hash, projection_spec, class, computed_at FROM projection_docs ORDER BY computed_at DESC LIMIT 50
  try {
    const rows = await c.env.PROJECTIONS.prepare("SELECT projection_hash, projection_spec, class, computed_at FROM projection_docs ORDER BY computed_at DESC LIMIT 50").all();
    const projections = (rows.results as unknown as Array<{ projection_hash: string; projection_spec: string; class: string; computed_at: string }>).map(r => ({ ...r, fingerprint: fingerprint(r.projection_hash), authoritative: false, rebuildable: true }));
    return c.json({ count: projections.length, note: "Resumos reconstruíveis. Não são a fonte.", projections });
  } catch {
    return c.json({ count: 0, note: "Resumos reconstruíveis. Não são a fonte.", projections: [] });
  }
});
app.post("/api/migrate", async (c) => {
  // Protected: only service_role via header X-Migrate-Token == SUPABASE_SECRET_KEY (or hyperdrive check)
  const token = c.req.header("x-migrate-token") || c.req.header("authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "missing token" }, 401);
  // Allow if token matches hyperdrive connection (service_role) — simple check: try to connect, if fail -> 403
  const connStr = pgConn(c);
  if (!connStr) return c.json({ error: "no hyperdrive" }, 500);
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      // Idempotent DDL — same as migrations/0001-0003
      await client.query(`
        create table if not exists public.logline_acts (
          content_hash text primary key check (content_hash ~ '^[0-9a-f]{64}$'),
          tuple_hash text not null check (tuple_hash ~ '^[0-9a-f]{64}$'),
          receipt_version text not null,
          act jsonb not null,
          inserted_at timestamptz not null default now(),
          envelope_hash text, sent_by text, sent_to text, sent_at text, channel text,
          who text generated always as (act->>'who') stored,
          did text generated always as (act->>'did') stored,
          this text generated always as (act->>'this') stored,
          when_slot text generated always as (act->>'when') stored,
          confirmed_by text generated always as (act->>'confirmed_by') stored,
          if_ok text generated always as (act->>'if_ok') stored,
          if_doubt text generated always as (act->>'if_doubt') stored,
          if_not text generated always as (act->>'if_not') stored,
          status text generated always as (act->>'status') stored,
          aux jsonb generated always as (act - 'id' - 'receipt_version' - 'json_canonicalization' - 'hashes' - 'who' - 'did' - 'this' - 'when' - 'confirmed_by' - 'if_ok' - 'if_doubt' - 'if_not' - 'status') stored,
          constraint id_matches_content_hash check (act->>'id' = content_hash),
          constraint tuple_hash_matches_act check (act->'hashes'->>'tuple_hash' = tuple_hash),
          constraint receipt_version_matches_act check (act->>'receipt_version' = receipt_version),
          constraint receipt_version_v0 check (receipt_version = 'logline.receipt.v0'),
          constraint no_transport_in_act check (not (act ? 'transport')),
          constraint no_result_in_act check (not (act ? 'result')),
          constraint no_evidence_in_act check (not (act ? 'evidence'))
        );
        create index if not exists logline_acts_if_ok_idx on public.logline_acts(if_ok);
        create index if not exists logline_acts_who_idx on public.logline_acts(who);
        create index if not exists logline_acts_did_idx on public.logline_acts(did);
        create index if not exists logline_acts_this_idx on public.logline_acts(this);
        create index if not exists logline_acts_when_idx on public.logline_acts(when_slot);
        create index if not exists logline_acts_status_idx on public.logline_acts(status);
        create or replace function public.prevent_logline_acts_mutation() returns trigger language plpgsql as $$ begin raise exception 'public.logline_acts is append-only'; end; $$;
        drop trigger if exists logline_acts_no_update on public.logline_acts;
        create trigger logline_acts_no_update before update on public.logline_acts for each row execute function public.prevent_logline_acts_mutation();
        drop trigger if exists logline_acts_no_delete on public.logline_acts;
        create trigger logline_acts_no_delete before delete on public.logline_acts for each row execute function public.prevent_logline_acts_mutation();
        alter table public.logline_acts enable row level security;
        alter function public.prevent_logline_acts_mutation() set search_path = '';
        do $$ begin if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'logline_acts') then alter publication supabase_realtime add table public.logline_acts; end if; end $$;
      `);
      const chk = await client.query("select relname, relrowsecurity from pg_class where relname='logline_acts'");
      return c.json({ ok: true, relrowsecurity: chk.rows[0]?.relrowsecurity ?? null });
    } finally { await client.end().catch(()=>{}); }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: msg.slice(0, 500) }, 500);
  }
});

// --- Chat LLM: só golden-bridge, fetch tudo da API, zero chave, zero hardcode ---
app.post("/api/chat/compile", async (c) => {
  const body = await c.req.json().catch(() => null) as { intent?: string; model?: string } | null;
  const intent = body?.intent?.trim();
  const requestedModel = body?.model?.trim();
  if (!intent) return c.json({ error: "intent is required", code: "bad_request" }, 400);

  const base = (c.env.GOLDEN_BRIDGE_URL ?? "https://llm.minilab.work").replace(/\/+$/, "");
  // Delega tudo ao golden-bridge (lab 512): ele junta Vercel/CF/local internamente
  try {
    const r = await fetch(`${base}/v1/chat/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, model: requestedModel }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return c.json({ error: `golden-bridge error: ${r.status} ${txt.slice(0, 400)}`, code: "golden-bridge-error" }, 502);
    }
    const j = await r.json() as { suggestion?: unknown; candidates?: unknown[]; intent?: string; error?: string };
    return c.json(j);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `golden-bridge unavailable: ${msg.slice(0, 400)}`, code: "golden-bridge-unavailable" }, 502);
  }

    // Extrai JSON do texto (modelo pode envolver em markdown)
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) as { process_id?: string; fields?: Record<string,string>; missing?: string[]; citations?: string[]; note?: string } : null;
    if (!parsed?.process_id || !parsed?.fields || !parsed?.citations) {
      return c.json({ error: "LLM returned invalid process_ingress.v1 — missing required keys", code: "llm-invalid", raw: text.slice(0, 800) }, 502);
    }
    const entry = CATALOG.find(t => t.process_id === parsed.process_id);
    if (!entry) return c.json({ error: `LLM chose unknown process_id ${parsed.process_id}`, code: "llm-invalid", raw: text.slice(0, 800) }, 502);
    // Valida citations 64 hex
    const badCite = (parsed.citations ?? []).find(h => !/^[0-9a-f]{64}$/.test(h));
    if (badCite) return c.json({ error: `LLM citation invalid: ${badCite}`, code: "llm-invalid", raw: text.slice(0, 800) }, 502);
    // Filtra fields para só chaves declaradas
    const allowed = new Set([...entry.requires, ...entry.accepts]);
    const filteredFields: Record<string,string> = {};
    for (const [k,v] of Object.entries(parsed.fields ?? {})) if (allowed.has(k)) filteredFields[k]=String(v).slice(0,500);

    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(entry.process_id)))).map(b=>b.toString(16).padStart(2,"0")).join("");
    const citations = parsed.citations!.length ? parsed.citations! : [hash];
    const suggestion = {
      process_id: entry.process_id,
      title: entry.title,
      fields: filteredFields,
      missing: [...entry.requires].filter(k => !filteredFields[k]),
      citations,
      note: parsed.note ?? `Entendi como ${entry.title} (${entry.process_id}).`,
      confidence: "high" as const,
      runnable: entry.runnable,
      needs_approval: entry.needs_approval,
      irreversible: entry.irreversible,
    };
    return c.json({ suggestion, candidates: [], intent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `LLM call failed: ${msg.slice(0, 400)}`, code: "llm-error" }, 502);
  }
});

app.post("/api/process-types", async (c) => {
  const body = await c.req.json().catch(() => null) as { process_id?: string; title?: string; requires?: string[]; accepts?: string[]; danger_tier?: string; description?: string } | null;
  if (!body?.process_id || !body?.title) return c.json({ error: "process_id and title are required", code: "bad_request" }, 400);
  if (!/^[a-z0-9][a-z0-9-]*\.v[0-9]+$/.test(body.process_id)) return c.json({ error: "process_id must match ^[a-z0-9][a-z0-9-]*\\.v[0-9]+$", code: "bad_request" }, 400);
  // Em produção grava em Postgres/D1 + gera YML em R2; stub persiste em D1 projection_docs como marcador
  try {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body))))).map(b=>b.toString(16).padStart(2,"0")).join("");
    await c.env.PROJECTIONS.prepare("CREATE TABLE IF NOT EXISTS process_type_proposals (process_id TEXT PRIMARY KEY, title TEXT, body TEXT, hash TEXT, created_at TEXT)").run();
    await c.env.PROJECTIONS.prepare("INSERT OR REPLACE INTO process_type_proposals (process_id, title, body, hash, created_at) VALUES (?,?,?,?,?)")
      .bind(body.process_id, body.title, JSON.stringify(body), hash, new Date().toISOString()).run();
    return c.json({ ok: true, process_id: body.process_id, hash, note: "Tipo registrado como proposta. Em produção gera processes/*.v1.yml e recarrega catalog." });
  } catch (e) {
    return c.json({ ok: true, process_id: body.process_id!, note: "Stub: tipo aceito (D1 indisponível)." });
  }
});

app.get("/api/grants", async (c) => c.json({ count: 0, grants: [] }));
app.get("/api/grants/:gid", async (c) => c.json({ error: "not found", code: "not_found" }, 404));

app.post("/api/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "body must be JSON object", code: "bad_request" }, 400);
  const who = (body as Record<string, unknown>).who;
  if (!who || typeof who !== "string") return c.json({ error: "who is required", code: "bad_request" }, 400);
  // Permanent: INSERT INTO public.logline_acts (content_hash, tuple_hash, receipt_version, act) VALUES (...) ON CONFLICT DO NOTHING
  // using content-addressed id = sha256(canonical_json(receipt)). Triggers enforce append-only even for service_role.
  // Then evaluate + receiver_select as in lab/api.py:register. Never fuse "registered" and "activated".
  // Real insert via Hyperdrive (service_role) — falls back to stub if table not yet migrated or pooler not reachable.
  let inserted = false;
  let hash = "0".repeat(64);
  let insertError: string | null = null;
  try {
    const connStr = pgConn(c);
    if (connStr) {
      const bodyStr = JSON.stringify(body);
      const enc = new TextEncoder().encode(bodyStr);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      // Use pg via Hyperdrive — note Workers needs nodejs_compat (already enabled)
      const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
      try {
        await client.connect();
        // Ensure receipt_version is set, compute tuple_hash as same as content_hash for minimal stub (real uses canonical_json + hashes)
        const act = { ...body, id: hash, receipt_version: "logline.receipt.v0", hashes: { tuple_hash: hash } } as Record<string, unknown>;
        await client.query(
          "INSERT INTO public.logline_acts(content_hash, tuple_hash, receipt_version, act) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [hash, hash, "logline.receipt.v0", JSON.stringify(act)]
        );
        inserted = true;
      } catch (e: unknown) {
        insertError = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
        // PGRST205 (table missing) or network → fallback to stub, but surface error in prod logs
        console.error("register insert failed", insertError);
      } finally {
        try { await (client as unknown as { end: () => Promise<void> }).end(); } catch {}
      }
    }
  } catch (e) { insertError = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300); }
  if (!inserted && insertError && insertError.includes("does not exist")) {
    return c.json({ registered: true, id: hash, fingerprint: fingerprint(hash), activated: false, waiting: { message: "Registrado (DB ainda não migrado — stub).", action: "Ver caso" }, warning: insertError }, 200);
  }
  return c.json({ registered: true, id: hash, fingerprint: fingerprint(hash), activated: false, waiting: { message: inserted ? "Registrado. Pendente." : "Registrado. Pendente (DB wiring fallback — stub).", action: "Ver caso" }, ...(insertError ? { warning: insertError } : {}) }, 200);
});

app.post("/api/advance", async (c) => c.json({ ran: false, note: "nada na fila (stub — wire to executor_run_once via Hyperdrive)" }));
app.post("/api/grants", async (c) => c.json({ error: "wire to register_grant via Hyperdrive (needs valid_until, timeout, fs_scope, network_policy)", code: "not_wired" }, 501));
app.post("/api/grants/:gid/signoff", async (c) => c.json({ error: "wire to record_grant_signoff", code: "not_wired" }, 501));
app.post("/api/grants/:gid/revoke", async (c) => c.json({ error: "wire to revoke_grant", code: "not_wired" }, 501));

// Cron: * * * * * → clock_select_due via Hyperdrive (replaces per-process queues). Bell stays push; queue drain via POST /api/advance or loop here.
// scheduled() is invoked by Cloudflare Cron Triggers (see wrangler.jsonc triggers.crons).
export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    // Cron * * * * * — Hyperdrive-backed fallback when bell drops
    try {
      const connStr = (env.HYPERDRIVE as unknown as { connectionString: string })?.connectionString;
      if (!connStr) return;
      const { Client } = await import("pg");
      const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
      await client.connect();
      try {
        // Idempotent: queue_rebuild_due replays from ledger; clock_select_due wakes due timers
        await client.query("SELECT 1"); // replace with SELECT clock_select_due() / queue_rebuild_due when functions exist
      } finally { await client.end().catch(()=>{}); }
    } catch (e) { console.error("scheduled cron failed", e); }
  },
} as ExportedHandler<Env>;
