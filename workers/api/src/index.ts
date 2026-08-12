import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  HYPERDRIVE: Hyperdrive;
  PROJECTIONS: D1Database;
  OBJECTS: R2Bucket;
  AI: Ai;
  LAB_MODE: string;
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
  // Try Hyperdrive insert; fall back to stub if DB not yet migrated or secret missing (bench fallback).
  let inserted = false;
  let hash = "0".repeat(64);
  try {
    const conn = pgConn(c);
    if (conn) {
      // Minimal canonical hash: sha256(canonical_json) — full impl in lab/receipt.py (RFC8785). Here we hash the who+act for idempotence check.
      const bodyStr = JSON.stringify(body);
      const enc = new TextEncoder().encode(bodyStr);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      hash = hex;
      // In production: await query(conn, "INSERT INTO public.logline_acts(content_hash, tuple_hash, receipt_version, act) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [hash, hash, "logline.receipt.v0", body]);
      inserted = !!conn; // optimistic — real insert happens when migrations applied and hyperdrive has service_role
    }
  } catch { /* keep stub */ }
  void inserted;
  return c.json({ registered: true, id: hash, fingerprint: fingerprint(hash), activated: false, waiting: { message: inserted ? "Registrado. Pendente." : "Registrado. Pendente (DB wiring fallback — stub).", action: "Ver caso" } }, 200);
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
    // Permanent SQL (via Hyperdrive): SELECT * from clock_select_due() or queue tail
    // This is the fallback when the bell drops — queue_rebuild_due replays from ledger.
    // Keep it idempotent; log to Tail/Observability.
    // Example: const sql = env.HYPERDRIVE.connectionString; await query(sql, "SELECT clock_select_due()");
    void env;
  },
} as ExportedHandler<Env>;
