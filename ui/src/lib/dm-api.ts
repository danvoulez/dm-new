// Human-toned client for dm-new lab/api.py
// No weird institutional words — talk like a major platform.

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let message = txt;
    if (txt) {
      try {
        const parsed = JSON.parse(txt) as { error?: unknown; message?: unknown; action?: unknown };
        const base = typeof parsed.error === "string"
          ? parsed.error
          : parsed.error && typeof parsed.error === "object" && "message" in parsed.error && typeof parsed.error.message === "string"
            ? parsed.error.message
            : typeof parsed.message === "string" ? parsed.message : txt;
        const action = typeof parsed.action === "string"
          ? parsed.action
          : parsed.error && typeof parsed.error === "object" && "action" in parsed.error && typeof parsed.error.action === "string"
            ? parsed.error.action : "";
        message = action ? `${base} ${action}` : base;
      } catch {
        // Plain-text errors are already human-readable.
      }
    }
    throw new Error(message || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Types shaped by lab/api.py
export type NowView = {
  needs_you: Pendency[];
  needs_operator: Pendency[];
  moving: Array<{ source_hash: string; fingerprint: string | null; process_id: string; when: string }>;
  closed_today: Array<{ source_hash: string; result_hash: string; fingerprint: string | null; process_id: string; when: string }>;
};

export type Pendency = {
  id: string;
  fingerprint: string | null;
  source_hash: string;
  grant_id?: string | null;
  source_fingerprint: string | null;
  process_id?: string;
  when: string;
  code: string;
  message: string;
  action: string;
  resolved_by: "user" | "operator";
  known: boolean;
  danger_tier?: string;
  missing: string[];
};

export type ProcessType = {
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
  readiness: string;
  readiness_reason: string;
  evidence_must_include: string[];
};

export type Vocabulary = { count: number; reasons: Array<{ code: string; template: string; action: string; resolved_by: string }> };

export type CaseView = {
  hash: string;
  fingerprint: string | null;
  title: string;
  process_title: string;
  found: boolean;
  valid: boolean;
  slots: Record<string, string>;
  fields: Record<string, unknown>;
  timeline: Array<{ step: string; label: string; when: string; hash: string; fingerprint: string | null; code?: string; message?: string; action?: string }>;
  came_from: unknown[];
  produced: Array<{ hash: string; fingerprint: string | null; did: string }>;
};


export type ProcessListItem = {
  hash: string;
  title: string;
  process_title: string;
  state: "registered" | "moving" | "waiting" | "closed";
  when: string | null;
};

export type GrantStanding = {
  grant_id: string;
  process: string | null;
  adapter: string | null;
  granted_by: string | null;
  granted_to: string | null;
  valid_until: string | null;
  acu_limit: number | null;
  timeout_seconds: number | null;
  fs_scope: string | null;
  network_policy: string | null;
  revoked: boolean;
  expired: boolean;
  signed_off: boolean;
  signoff_reason: string;
  signer: string | null;
};

export type CandidatesView = { count: number; candidates: Array<{ id: string; fingerprint: string | null; did: string; when: string; payload: unknown; citations: unknown[] }> };
export type ProjectionsView = { count: number; note: string; projections: Array<{ projection_hash: string; fingerprint: string | null; spec: string; class: string; computed_at: string }> };

export type ProcessTypeCreate = {
  process_id: string;
  title: string;
  requires: string[];
  accepts: string[];
  danger_tier: string;
  description?: string;
};

export type ModelSource = {
  id: "local" | "vercel" | "cloudflare";
  label: string;
  status: "available" | "degraded" | "not_configured";
  checked_at: string;
  model_count: number;
  message?: string;
};

export type ModelInfo = {
  id: string;
  object: "model";
  name: string;
  source: ModelSource["id"];
  upstream_model: string;
  context_window?: number | null;
  capabilities: Record<string, unknown>;
  selectable: boolean;
  certification: {
    profile: "dream-agent.v1";
    status: "current" | "failed";
    certified_at: string;
    expires_at: string;
    checks: Record<"conversation" | "tool_call" | "tool_result" | "schema" | "system_prompt", boolean>;
    reason?: string;
  };
};

export type ModelCatalog = {
  object: "list";
  provider: "golden-bridge";
  generated_at: string;
  ttl_seconds: number;
  certification_profile: "dream-agent.v1";
  sources: ModelSource[];
  data: ModelInfo[];
};

export type ChatRisk = "none" | "approval" | "irreversible";
export type ChatAction =
  | { kind: "confirm_register"; summary: string; fields: Record<string, string>; missing: string[]; risk: ChatRisk; register_body: Record<string, unknown> }
  | { kind: "confirm_new_type"; summary: string; contract_draft: ProcessTypeCreate }
  | { kind: "confirm_grant"; summary: string; grant_draft: Record<string, unknown> }
  | { kind: "request_passkey"; summary: string; grant_id: string; sign_options: Record<string, unknown> }
  | { kind: "status"; summary: string; case_hash?: string }
  | { kind: "clarify"; question: string };

export type ChatTurnResult = {
  reply: string;
  conversation_id: string;
  action?: ChatAction;
  registrations?: RegistrationResult[];
};

export type RegistrationResult = {
  registered: boolean;
  id: string;
  fingerprint?: string | null;
  activated: boolean;
  process_id?: string | null;
  queued?: boolean;
  waiting?: { code?: string; message?: string; action?: string; resolved_by?: string };
  missing?: string[];
};

export const dmApi = {
  health: () => req<{ ok: boolean; ledger: string; acts: number }>("/api/health"),
  now: () => req<NowView>("/api/now"),
  vocabulary: () => req<Vocabulary>("/api/vocabulary"),
  processTypes: () => req<{ count: number; types: ProcessType[] }>("/api/process-types"),
  processes: () => req<{ count: number; processes: ProcessListItem[] }>("/api/processes"),
  pendencies: (resolved_by?: string) => req<{ count: number; pendencies: Pendency[] }>(`/api/pendencies${resolved_by ? `?resolved_by=${resolved_by}` : ""}`),
  case: (hash: string) => req<CaseView>(`/api/cases/${hash}`),
  candidates: () => req<CandidatesView>("/api/candidates"),
  projections: () => req<{ count: number; note: string; projections: ProjectionsView["projections"] }>("/api/projections"),
  grants: () => req<{ count: number; grants: GrantStanding[] }>("/api/grants"),
  grant: (gid: string) => req<GrantStanding>(`/api/grants/${gid}`),
  signoff: (gid: string, body: { signer: string; credential: unknown }) => req<{ verified: boolean; signed_off: boolean; id: string }>(`/api/grants/${gid}/signoff`, { method: "POST", body: JSON.stringify(body) }),
  webauthnEnrollOptions: (identity: string) => req<Record<string, unknown>>(`/api/webauthn/enroll/options`, { method: "POST", body: JSON.stringify({ identity }) }),
  webauthnEnrollVerify: (identity: string, credential: unknown) => req<{ verified: boolean; enrolled: boolean; id: string }>(`/api/webauthn/enroll/verify`, { method: "POST", body: JSON.stringify({ identity, credential }) }),
  webauthnSignOptions: (identity: string, grant_id: string) => req<Record<string, unknown>>(`/api/webauthn/sign/options`, { method: "POST", body: JSON.stringify({ identity, grant_id }) }),
  webauthnSignVerify: (identity: string, grant_id: string, credential: unknown) => req<{ verified: boolean; signed_off: boolean; id: string }>(`/api/webauthn/sign/verify`, { method: "POST", body: JSON.stringify({ identity, grant_id, credential }) }),
  revoke: (gid: string, body: { revoked_by: string }) => req<unknown>(`/api/grants/${gid}/revoke`, { method: "POST", body: JSON.stringify(body) }),
  createGrant: (body: Record<string, unknown>) => req<{ registered: boolean; grant_id: string; fingerprint: string | null }>(`/api/grants`, { method: "POST", body: JSON.stringify(body) }),
  advance: (body: Record<string, unknown>) => req<{ ran?: boolean; note?: string }>(`/api/advance`, { method: "POST", body: JSON.stringify(body) }),
  register: (body: Record<string, unknown>) => req<RegistrationResult>(`/api/register`, { method: "POST", body: JSON.stringify(body) }),
  chatTurn: (message: string, conversation_id?: string, model?: string) => req<ChatTurnResult>(`/api/chat/turn`, { method: "POST", body: JSON.stringify({ message, ...(conversation_id ? { conversation_id } : {}), ...(model ? { model } : {}) }) }),
  createProcessType: (body: ProcessTypeCreate) => req<{ ok: boolean; process_id: string; note?: string }>(`/api/process-types`, { method: "POST", body: JSON.stringify(body) }),
  models: () => req<ModelCatalog>(`/api/models`),
};
