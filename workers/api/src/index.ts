import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { CATALOG } from "./vocabulary";
import { appendAct, withClient } from "./db";
import { loadContracts } from "./contracts";
import { evaluate } from "./evaluator";
import { RegisterActivationError, registerFlow, registerResponse } from "./register-flow";
import { candidatesView, caseView, executorRunOnce, nowView, pendenciesView, processesView, receiverSelect, resumeGrantSources } from "./runtime";
import { canGenericRegisterDid } from "./control-plane";
import { runChatTurn } from "./chat";
import { ProcessToolError, readProcessContract, searchProcesses } from "./process-tools";
import { ensureRegisteredContract } from "./contract-registration";
import { authorityRecognized, getGrantStanding, listGrants, registerGrant, revokeGrant, validateGrantInput, type GrantInput } from "./grants";
import { SEED_CONTRACTS } from "./seed-contracts";
import { createEnrollmentOptions, createSignOptions, verifyEnrollment, verifyGrantSignoff } from "./webauthn";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { fetchModelCatalog } from "./model-catalog";
import { migrateReceiptV1 } from "./postgres-migrate";
import { about as aboutTool, append as appendTool, search as searchTool, UniversalToolError } from "./universal-tools";

export type Env = {
  HYPERDRIVE: Hyperdrive;
  PROJECTIONS: D1Database;
  OBJECTS: R2Bucket;
  AI: Ai;
  LAB_MODE: string;
  MIGRATE_TOKEN?: string;
  GENESIS_AUTHORITY?: string;
  WEBAUTHN_RP_ID?: string;
  WEBAUTHN_ORIGIN?: string;
  WEBAUTHN_RP_NAME?: string;
  GOLDEN_BRIDGE_URL?: string;
  GOLDEN_BRIDGE_ACCESS_ID?: string;
  GOLDEN_BRIDGE_ACCESS_SECRET?: string;
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
    if (/^https:\/\/[^.]+\.carbonlab\.work$/.test(origin)) return origin;
    return "";
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Migrate-Token"],
  credentials: false,
}));

function fingerprint(hash: string | null | undefined) {
  return hash ? hash.slice(0, 8) : null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dbFailure(error: unknown) {
  const message = errorText(error);
  const notMigrated = /current_process_types|current_vocabulary|process_contracts|runtime_queue|logline_acts/.test(message) && /does not exist|undefined table|undefined relation/i.test(message);
  return {
    error: notMigrated ? "database schema is not migrated" : "database unavailable",
    code: notMigrated ? "not_migrated" : "database_unavailable",
    detail: message.slice(0, 300),
  };
}

app.get("/api/health", async (c) => {
  try {
    const state = await withClient(c.env, async (client) => {
      const result = await client.query<{ acts: string; process_types: string }>(
        `SELECT
          (SELECT count(*)::text FROM public.logline_acts) AS acts,
          (SELECT count(*)::text FROM public.process_contracts) AS process_types`,
      );
      return result.rows[0];
    });
    return c.json({
      ok: true,
      mode: c.env.LAB_MODE ?? "production",
      ledger: "public.logline_acts@postgres via Hyperdrive",
      projections: "D1@dm-projections",
      acts: Number(state?.acts ?? 0),
      process_types: Number(state?.process_types ?? 0),
      rls: "enabled, no policies - service role membrane",
    });
  } catch (error) {
    return c.json({ ok: false, ...dbFailure(error) }, 503);
  }
});

app.get("/api/vocabulary", (c) => {
  const reasons = Object.entries(CATALOG).map(([code, [template, action, resolved_by]]) => ({ code, template, action, resolved_by }));
  return c.json({ count: reasons.length, reasons });
});

// Canonical v1.2 universal LLM/runtime surface: KNOW · SEARCH · APPEND.
app.get("/api/about", async (c) => {
  try {
    return c.json(await withClient(c.env, (client) => aboutTool(client)));
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/search", async (c) => {
  const query = c.req.query("q") ?? c.req.query("query") ?? "";
  const requestedLimit = Number(c.req.query("limit") ?? 20);
  try {
    return c.json(await withClient(c.env, (client) => searchTool(client, query, requestedLimit)));
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.post("/api/append", async (c) => {
  const proposal = await c.req.json().catch(() => null);
  const identity = c.req.header("cf-access-authenticated-user-email")?.trim() || undefined;
  try {
    const result = await withClient(c.env, (client) => appendTool(client, proposal, identity ? { identity } : {}));
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof UniversalToolError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    }
    if (error instanceof RegisterActivationError) {
      const receipt = error.receipt;
      return c.json({
        verified: true,
        registered: true,
        id: receipt.id,
        content_hash: receipt.hashes.content_hash,
        tuple_hash: receipt.hashes.tuple_hash,
        envelope_hash: "envelope_hash" in receipt.hashes ? receipt.hashes.envelope_hash : null,
        fingerprint: fingerprint(receipt.id),
        activated: false,
        queued: false,
        error: "registered, but activation is unavailable",
        code: "runtime_unavailable",
        detail: error.causeDetail.slice(0, 300),
      }, 503);
    }
    const typed = error as { code?: unknown; status?: unknown; detail?: unknown };
    if (typeof typed?.code === "string" && typeof typed?.status === "number" && typed.status >= 400 && typed.status <= 599) {
      return c.json({ error: errorText(error), code: typed.code, ...(typed.detail ? { detail: typed.detail } : {}) }, typed.status as 400);
    }
    const detail = errorText(error);
    if (/forbidden top-level|receipt slot|JCS|unsupported JCS/i.test(detail)) return c.json({ error: detail, code: "bad_request" }, 400);
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/models", async (c) => {
  try {
    return c.json(await fetchModelCatalog(c.env));
  } catch (error) {
    const typed = error as { code?: string; action?: string };
    return c.json({ object: "list", provider: "golden-bridge", sources: [], data: [], error: errorText(error), code: typed.code ?? "model_catalog_unavailable", action: typed.action }, 502);
  }
});

app.get("/v1/models", async (c) => {
  try {
    return c.json(await fetchModelCatalog(c.env));
  } catch (error) {
    const typed = error as { code?: string; action?: string };
    return c.json({ object: "list", provider: "golden-bridge", sources: [], data: [], error: errorText(error), code: typed.code ?? "model_catalog_unavailable", action: typed.action }, 502);
  }
});

app.get("/api/process-types", async (c) => {
  try {
    const query = c.req.query("query")?.trim() ?? "";
    const types = await withClient(c.env, (client) => searchProcesses(client, query));
    return c.json({ count: types.length, types });
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/process-types/:process_id", async (c) => {
  try {
    const detail = await withClient(c.env, (client) => readProcessContract(client, c.req.param("process_id")));
    return c.json({
      ...detail,
      citation_state: detail.citable ? "citable" : "contract_not_citable",
      runnable_for_llm: detail.citable && detail.danger.readiness === "runnable",
    });
  } catch (error) {
    if (error instanceof ProcessToolError && error.code === "process_not_found") {
      return c.json({ error: error.message, code: error.code }, 404);
    }
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/now", async (c) => {
  try {
    return c.json(await withClient(c.env, (client) => nowView(client)));
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/processes", async (c) => {
  try {
    return c.json(await withClient(c.env, (client) => processesView(client)));
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/pendencies", async (c) => {
  try {
    return c.json(await withClient(c.env, (client) => pendenciesView(client, c.req.query("resolved_by"))));
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/cases/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "hash must be 64 hex", code: "bad_request" }, 400);
  try {
    const detail = await withClient(c.env, (client) => caseView(client, hash));
    if (!detail) return c.json({ error: "case not found", code: "not_found" }, 404);
    return c.json(detail);
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/candidates", async (c) => {
  try {
    return c.json(await withClient(c.env, (client) => candidatesView(client)));
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/projections", async (c) => {
  try {
    const rows = await c.env.PROJECTIONS.prepare("SELECT projection_hash, projection_spec, class, computed_at FROM projection_docs ORDER BY computed_at DESC LIMIT 50").all();
    const projections = (rows.results as unknown as Array<{ projection_hash: string; projection_spec: string; class: string; computed_at: string }>).map((row) => ({
      ...row,
      fingerprint: fingerprint(row.projection_hash),
      authoritative: false,
      rebuildable: true,
    }));
    return c.json({ count: projections.length, note: "Resumos reconstruiveis. Nao sao a fonte.", projections });
  } catch (error) {
    return c.json({ error: "projection store unavailable", code: "projection_store_unavailable", detail: errorText(error).slice(0, 300) }, 503);
  }
});

app.post("/api/migrate", async (c) => {
  const supplied = c.req.header("x-migrate-token") || c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!c.env.MIGRATE_TOKEN) return c.json({ error: "MIGRATE_TOKEN is not configured", code: "not_configured" }, 501);
  if (!supplied || supplied !== c.env.MIGRATE_TOKEN) return c.json({ error: "forbidden", code: "forbidden" }, 403);
  try {
    const result = await withClient(c.env, async (client) => {
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
        create table if not exists public.process_contracts (
          process_id text primary key,
          title text not null,
          contract jsonb not null,
          status text not null default 'active',
          source_yml text,
          registered_hash text references public.logline_acts(content_hash),
          created_at timestamptz not null default now()
        );
        create table if not exists public.runtime_queue (
          queue_id text primary key,
          source_hash text not null references public.logline_acts(content_hash),
          process_id text not null,
          adapter text not null,
          status text not null default 'queued' check(status in ('queued','claimed','closed','failed','released')),
          attempts integer not null default 0,
          claimed_by text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          result_hash text references public.logline_acts(content_hash),
          last_error text,
          unique(source_hash,process_id,adapter)
        );
        create index if not exists runtime_queue_status_idx on public.runtime_queue(status,created_at);
      `);
      await migrateReceiptV1(client);
      for (const seed of SEED_CONTRACTS) {
        await client.query(
          `INSERT INTO public.process_contracts(process_id,title,contract,status,source_yml)
           VALUES ($1,$2,$3::jsonb,$4,$5)
           ON CONFLICT(process_id) DO UPDATE SET
             registered_hash=CASE WHEN public.process_contracts.contract=excluded.contract
               THEN public.process_contracts.registered_hash ELSE NULL END,
             title=excluded.title,contract=excluded.contract,status=excluded.status,source_yml=excluded.source_yml`,
          [seed.process_id, seed.title, JSON.stringify(seed.contract), seed.status, seed.source_yml],
        );
      }
      const genesis = c.env.GENESIS_AUTHORITY?.trim();
      if (genesis && !(await authorityRecognized(client, genesis))) {
        await appendAct(client, {
          who: genesis, did: "authority", this: genesis, when: new Date().toISOString(),
          confirmed_by: genesis, if_ok: "authority-active.v1", if_doubt: "attention-raise.v1", if_not: "stop",
          status: "active", registered_by: genesis, genesis: true, note: "Worker bootstrap genesis",
        });
      }
      if (genesis) {
        for (const seed of SEED_CONTRACTS) await ensureRegisteredContract(client, seed, genesis);
      }
      const count = await client.query<{ legacy_count: number; ledger_count: number; vocabulary_count: number }>(
        `SELECT
          (SELECT count(*)::int FROM public.process_contracts) AS legacy_count,
          (SELECT count(*)::int FROM public.current_process_types) AS ledger_count,
          (SELECT count(*)::int FROM public.current_vocabulary) AS vocabulary_count`,
      );
      return {
        legacy_count: count.rows[0]?.legacy_count ?? 0,
        ledger_count: count.rows[0]?.ledger_count ?? 0,
        vocabulary_count: count.rows[0]?.vocabulary_count ?? 0,
        genesis: genesis || null,
      };
    });
    return c.json({
      ok: true,
      process_types: result.ledger_count,
      vocabulary_terms: result.vocabulary_count,
      legacy_process_contracts: result.legacy_count,
      genesis_authority: result.genesis,
    });
  } catch (error) {
    return c.json({ ok: false, ...dbFailure(error) }, 500);
  }
});


app.post("/api/chat/turn", async (c) => {
  const body = await c.req.json().catch(() => null) as { message?: string; conversation_id?: string; model?: string } | null;
  const message = body?.message?.trim() ?? "";
  const conversationId = body?.conversation_id?.trim();
  if (!message) return c.json({ error: "message is required", code: "bad_request" }, 400);
  if (message.length > 12000) return c.json({ error: "message is too long", code: "bad_request" }, 400);
  if (conversationId && !/^[A-Za-z0-9_-]{8,80}$/.test(conversationId)) {
    return c.json({ error: "conversation_id is invalid", code: "bad_request" }, 400);
  }
  try {
    const result = await withClient(c.env, (client) => runChatTurn(c.env, client, {
      message,
      conversation_id: conversationId,
      model: body?.model?.trim() || undefined,
      identity: c.req.header("cf-access-authenticated-user-email")?.trim() || undefined,
    }));
    return c.json(result);
  } catch (error) {
    const detail = errorText(error);
    const typed = error as { code?: unknown; status?: unknown; action?: unknown };
    if (typeof typed?.code === "string" && typeof typed?.status === "number" && typed.status >= 400 && typed.status <= 599) {
      return c.json({
        error: detail,
        code: typed.code,
        action: typeof typed.action === "string" ? typed.action : "Escolha outro modelo disponível na Golden Bridge.",
      }, typed.status as 400);
    }
    if (/chat_turns|projection_docs|no such table/i.test(detail)) {
      return c.json({ error: "chat projection store is not migrated", code: "not_migrated", detail: detail.slice(0, 300) }, 503);
    }
    if (/golden_bridge|model_catalog|llm_|fetch failed|network/i.test(detail)) {
      return c.json({ error: detail.slice(0, 300), code: "model_unavailable", action: "Escolha outro modelo disponível na Golden Bridge." }, 502);
    }
    if (/current_process_types|current_vocabulary|process_contracts|runtime_queue|logline_acts|connect/i.test(detail)) return c.json(dbFailure(error), 503);
    return c.json({ error: "chat turn failed safely", code: "chat_turn_failed", detail: detail.slice(0, 300) }, 500);
  }
});

app.post("/api/process-types", async (c) => {
  const body = await c.req.json().catch(() => null) as { process_id?: string; title?: string; requires?: string[]; accepts?: string[]; danger_tier?: string; description?: string } | null;
  if (!body?.process_id || !body?.title) return c.json({ error: "process_id and title are required", code: "bad_request" }, 400);
  if (!/^[a-z0-9][a-z0-9-]*\.v[0-9]+$/.test(body.process_id)) return c.json({ error: "invalid process_id", code: "bad_request" }, 400);
  const draft = {
    process_id: body.process_id,
    title: body.title,
    required_aux: Array.isArray(body.requires) ? body.requires : [],
    optional_aux: Array.isArray(body.accepts) ? body.accepts : [],
    danger_tier: body.danger_tier || "L0",
    description: body.description || "",
  };
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(draft)));
    const hash = Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await c.env.PROJECTIONS.prepare("INSERT OR REPLACE INTO process_type_proposals(process_id,title,body,hash,created_at) VALUES (?,?,?,?,?)")
      .bind(body.process_id, body.title, JSON.stringify(draft), hash, new Date().toISOString()).run();
    return c.json({ ok: true, process_id: body.process_id, hash, draft, note: "Proposta registrada. O tipo só vira lei quando um Act defined_process_type entra no ledger." });
  } catch (error) {
    const detail = errorText(error);
    if (/process_type_proposals|no such table/i.test(detail)) {
      return c.json({ error: "process type proposal store is not migrated", code: "not_migrated", detail: detail.slice(0, 300) }, 503);
    }
    return c.json({ error: "process type proposal store unavailable", code: "proposal_store_unavailable", detail: detail.slice(0, 300) }, 503);
  }
});

app.get("/api/grants", async (c) => {
  try {
    const grants = await withClient(c.env, (client) => listGrants(client));
    return c.json({ count: grants.length, grants });
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.get("/api/grants/:gid", async (c) => {
  const gid = c.req.param("gid");
  if (!/^[0-9a-f]{64}$/.test(gid)) return c.json({ error: "grant id must be 64 hex", code: "bad_request" }, 400);
  try {
    const grant = await withClient(c.env, (client) => getGrantStanding(client, gid));
    if (!grant) return c.json({ error: "grant not found", code: "not_found" }, 404);
    return c.json(grant);
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.post("/api/grants", async (c) => {
  const body = await c.req.json().catch(() => null) as GrantInput | null;
  if (!body || typeof body !== "object") return c.json({ error: "body must be JSON object", code: "bad_request" }, 400);
  const invalid = validateGrantInput(body);
  if (invalid) return c.json({ error: `invalid or missing safety field: ${invalid}`, code: "bad_request", field: invalid }, 400);
  try {
    const grant = await withClient(c.env, (client) => registerGrant(client, body));
    return c.json({ registered: true, grant_id: grant.id, fingerprint: fingerprint(grant.id) }, 201);
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

app.post("/api/grants/:gid/revoke", async (c) => {
  const gid = c.req.param("gid");
  const body = await c.req.json().catch(() => null) as { revoked_by?: string; reason?: string } | null;
  const revokedBy = body?.revoked_by?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/.test(gid) || !revokedBy) return c.json({ error: "valid gid and revoked_by are required", code: "bad_request" }, 400);
  try {
    const result = await withClient(c.env, async (client) => {
      const grant = await getGrantStanding(client, gid);
      if (!grant) return { kind: "missing" as const };
      if (!(await authorityRecognized(client, revokedBy))) return { kind: "forbidden" as const };
      const receipt = await revokeGrant(client, gid, revokedBy, body?.reason || "revoked");
      return { kind: "ok" as const, receipt };
    });
    if (result.kind === "missing") return c.json({ error: "grant not found", code: "not_found" }, 404);
    if (result.kind === "forbidden") return c.json({ error: "revoked_by is not a recognized authority", code: "unregistered_authority" }, 403);
    return c.json({ revoked: true, id: result.receipt.id, fingerprint: fingerprint(result.receipt.id) });
  } catch (error) {
    return c.json(dbFailure(error), 503);
  }
});

function webauthnError(code: string, detail?: string) {
  const messages: Record<string, string> = {
    not_found: "grant not found",
    unregistered_authority: "identity is not a recognized authority",
    grant_unsigned: "authority has no enrolled passkey",
    signoff_signer_mismatch: "signer must be the authority that granted this authorization",
    signature_invalid: "passkey assertion is invalid, expired, or already used",
  };
  return { error: messages[code] ?? "WebAuthn operation failed", code, ...(detail ? { detail: detail.slice(0, 300) } : {}) };
}

function webauthnStatus(code: string): 403 | 404 {
  return code === "not_found" ? 404 : 403;
}

app.post("/api/webauthn/enroll/options", async (c) => {
  const body = await c.req.json().catch(() => null) as { identity?: string } | null;
  const identity = body?.identity?.trim() ?? "";
  if (!identity) return c.json({ error: "identity is required", code: "bad_request" }, 400);
  try {
    const result = await withClient(c.env, (client) => createEnrollmentOptions(c.env, client, identity));
    if (!result.ok) return c.json(webauthnError(result.code), webauthnStatus(result.code));
    return c.json(result.options);
  } catch (error) {
    return c.json({ error: "WebAuthn enrollment options unavailable", code: "webauthn_unavailable", detail: errorText(error).slice(0, 300) }, 503);
  }
});

app.post("/api/webauthn/enroll/verify", async (c) => {
  const body = await c.req.json().catch(() => null) as { identity?: string; credential?: RegistrationResponseJSON } | null;
  const identity = body?.identity?.trim() ?? "";
  if (!identity || !body?.credential) return c.json({ error: "identity and credential are required", code: "bad_request" }, 400);
  try {
    const result = await withClient(c.env, (client) => verifyEnrollment(c.env, client, identity, body.credential as RegistrationResponseJSON));
    if (!result.ok) return c.json(webauthnError(result.code, "detail" in result ? result.detail : undefined), webauthnStatus(result.code));
    return c.json({ verified: true, enrolled: true, id: result.id, fingerprint: fingerprint(result.id), credential_id: result.credential_id }, 201);
  } catch (error) {
    return c.json({ error: "WebAuthn enrollment verification unavailable", code: "webauthn_unavailable", detail: errorText(error).slice(0, 300) }, 503);
  }
});

app.post("/api/webauthn/sign/options", async (c) => {
  const body = await c.req.json().catch(() => null) as { identity?: string; grant_id?: string } | null;
  const identity = body?.identity?.trim() ?? "";
  const grantId = body?.grant_id?.trim() ?? "";
  if (!identity || !/^[0-9a-f]{64}$/.test(grantId)) return c.json({ error: "identity and a 64-hex grant_id are required", code: "bad_request" }, 400);
  try {
    const result = await withClient(c.env, (client) => createSignOptions(c.env, client, identity, grantId));
    if (!result.ok) return c.json(webauthnError(result.code), webauthnStatus(result.code));
    return c.json(result.options);
  } catch (error) {
    return c.json({ error: "WebAuthn sign options unavailable", code: "webauthn_unavailable", detail: errorText(error).slice(0, 300) }, 503);
  }
});

async function verifySignoffRequest(
  c: Context<{ Bindings: Env }>,
  grantIdFromPath?: string,
) {
  const body = await c.req.json().catch(() => null) as { identity?: string; signer?: string; grant_id?: string; credential?: AuthenticationResponseJSON } | null;
  const identity = (body?.identity || body?.signer || "").trim();
  const grantId = grantIdFromPath || body?.grant_id?.trim() || "";
  if (!identity || !/^[0-9a-f]{64}$/.test(grantId) || !body?.credential) {
    return c.json({ error: "identity/signer, grant_id, and credential are required", code: "bad_request" }, 400);
  }
  try {
    const result = await withClient(c.env, async (client) => {
      const verified = await verifyGrantSignoff(c.env, client, identity, grantId, body.credential as AuthenticationResponseJSON);
      if (!verified.ok) return verified;
      const resumed = await resumeGrantSources(client, grantId);
      return { ...verified, resumed };
    });
    if (!result.ok) return c.json(webauthnError(result.code, "detail" in result ? result.detail : undefined), webauthnStatus(result.code));
    return c.json({ verified: true, signed_off: true, id: result.id, fingerprint: fingerprint(result.id), sign_count: result.sign_count, resumed: result.resumed.length });
  } catch (error) {
    return c.json({ error: "WebAuthn signoff verification unavailable", code: "webauthn_unavailable", detail: errorText(error).slice(0, 300) }, 503);
  }
}

app.post("/api/webauthn/sign/verify", (c) => verifySignoffRequest(c));
app.post("/api/grants/:gid/signoff", (c) => verifySignoffRequest(c, c.req.param("gid")));

// Control-plane receipts can only be minted by their dedicated, validated endpoints.
// Otherwise a generic register call could forge authority, authenticator, grant, or signoff state.

app.post("/api/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "body must be JSON object", code: "bad_request" }, 400);
  const raw = body as Record<string, unknown>;
  const requestedDid = String(raw.did ?? "").trim();
  if (!canGenericRegisterDid(requestedDid)) {
    return c.json({ error: `did ${requestedDid} is reserved for a validated server-side flow`, code: "reserved_did" }, 403);
  }
  const fields = Object.fromEntries(Object.entries(raw).filter(([key]) => !["id", "hashes", "receipt_version", "json_canonicalization"].includes(key)));
  for (const slot of ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"]) {
    if (!(slot in fields)) fields[slot] = "";
  }
  if (!String(fields.when ?? "")) fields.when = new Date().toISOString();
  if (!String(fields.who ?? "").trim()) return c.json({ error: "who is required", code: "bad_request" }, 400);

  try {
    return await withClient(c.env, async (client) => {
      try {
        const outcome = await registerFlow(client, fields, { append: appendAct, loadCatalog: loadContracts, evaluateReceipt: evaluate, selectReceiver: receiverSelect });
        return c.json(registerResponse(outcome));
      } catch (runtimeError) {
        if (runtimeError instanceof RegisterActivationError) {
          return c.json({
            registered: true,
            id: runtimeError.receipt.id,
            fingerprint: fingerprint(runtimeError.receipt.id),
            activated: false,
            queued: false,
            error: "registered, but activation is unavailable",
            code: "runtime_unavailable",
            detail: runtimeError.causeDetail.slice(0, 300),
          }, 503);
        }
        throw runtimeError;
      }
    });
  } catch (error) {
    const message = errorText(error);
    if (/forbidden top-level|receipt slot|JCS|unsupported JCS/i.test(message)) return c.json({ error: message, code: "bad_request" }, 400);
    return c.json(dbFailure(error), 503);
  }
});

app.post("/api/advance", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { worker?: string };
  try {
    const queue = await withClient(c.env, (client) => executorRunOnce(client, body.worker?.trim() || "api"));
    if (!queue) return c.json({ ran: false, note: "nada na fila" });
    return c.json({ ran: true, queue });
  } catch (error) {
    return c.json({ error: "executor failed", code: "executor_failed", detail: errorText(error).slice(0, 300) }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    try {
      await withClient(env, (client) => executorRunOnce(client, "cron"));
    } catch (error) {
      console.error("scheduled executor failed", error);
    }
  },
} as ExportedHandler<Env>;
