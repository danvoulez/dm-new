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
    throw new Error(txt || `${res.status} ${res.statusText}`);
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
  found: boolean;
  valid: boolean;
  slots: Record<string, string>;
  fields: Record<string, unknown>;
  timeline: Array<{ step: string; label: string; when: string; hash: string; fingerprint: string | null; code?: string; message?: string; action?: string }>;
  came_from: unknown[];
  produced: Array<{ hash: string; fingerprint: string | null; did: string }>;
};

export type CandidatesView = { count: number; candidates: Array<{ id: string; fingerprint: string | null; did: string; when: string; payload: unknown; citations: unknown[] }> };
export type ProjectionsView = { count: number; note: string; projections: Array<{ projection_hash: string; fingerprint: string | null; spec: string; class: string; computed_at: string }> };

export type ChatSuggestion = {
  process_id: string;
  title: string;
  fields: Record<string, string>;
  missing: string[];
  citations: string[];
  note?: string;
  confidence: "high" | "medium" | "low";
  runnable: boolean;
  needs_approval: boolean;
  irreversible: boolean;
};

export type ChatCompileResult = {
  suggestion: ChatSuggestion | null;
  candidates: ChatSuggestion[];
  intent: string;
  note?: string;
};

export type ProcessTypeCreate = {
  process_id: string;
  title: string;
  requires: string[];
  accepts: string[];
  danger_tier: string;
  description?: string;
};

export type ModelInfo = { id: string; provider: "local" | "cloudflare" | "vercel"; object: string; owned_by: string };

export const dmApi = {
  health: () => req<{ ok: boolean; ledger: string; acts: number }>("/api/health"),
  now: () => req<NowView>("/api/now"),
  vocabulary: () => req<Vocabulary>("/api/vocabulary"),
  processTypes: () => req<{ count: number; types: ProcessType[] }>("/api/process-types"),
  pendencies: (resolved_by?: string) => req<{ count: number; pendencies: Pendency[] }>(`/api/pendencies${resolved_by ? `?resolved_by=${resolved_by}` : ""}`),
  case: (hash: string) => req<CaseView>(`/api/cases/${hash}`),
  candidates: () => req<CandidatesView>("/api/candidates"),
  projections: () => req<{ count: number; note: string; projections: ProjectionsView["projections"] }>("/api/projections"),
  grants: () => req<{ count: number; grants: unknown[] }>("/api/grants"),
  grant: (gid: string) => req<{ grant: unknown }>(`/api/grants/${gid}`),
  signoff: (gid: string, body: { signer: string; credential: string }) => req<unknown>(`/api/grants/${gid}/signoff`, { method: "POST", body: JSON.stringify(body) }),
  revoke: (gid: string, body: { revoked_by: string }) => req<unknown>(`/api/grants/${gid}/revoke`, { method: "POST", body: JSON.stringify(body) }),
  createGrant: (body: Record<string, unknown>) => req<unknown>(`/api/grants`, { method: "POST", body: JSON.stringify(body) }),
  advance: (body: Record<string, unknown>) => req<{ ran?: boolean; note?: string }>(`/api/advance`, { method: "POST", body: JSON.stringify(body) }),
  register: (body: Record<string, unknown>) => req<{ receipt: unknown; verdict: unknown; id: string; fingerprint: string | null; activated?: boolean; waiting?: { message?: string; action?: string } }>(`/api/register`, { method: "POST", body: JSON.stringify(body) }),
  chatCompile: (intent: string, model?: string) => req<ChatCompileResult>(`/api/chat/compile`, { method: "POST", body: JSON.stringify({ intent, model }) }),
  createProcessType: (body: ProcessTypeCreate) => req<{ ok: boolean; process_id: string; note?: string }>(`/api/process-types`, { method: "POST", body: JSON.stringify(body) }),
  models: () => req<{ object: string; data: ModelInfo[] }>(`/api/models`),
};
