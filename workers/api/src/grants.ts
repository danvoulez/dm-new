import type { PgClient } from "./db";
import { appendAct, getAct } from "./db";
import type { Receipt } from "./receipt";
import { NETWORK_POLICIES, validateGrantInput, type GrantInput } from "./grant-policy";

export { validateGrantInput };
export type { GrantInput };

function parseIso(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function registerGrant(client: PgClient, input: GrantInput): Promise<Receipt> {
  return appendAct(client, {
    who: String(input.granted_by),
    did: "grant",
    this: String(input.granted_to),
    when: new Date().toISOString(),
    confirmed_by: String(input.granted_by),
    if_ok: "grant-consume.v1",
    if_doubt: "attention-raise.v1",
    if_not: "executor.skip",
    status: "granted",
    adapter: String(input.adapter ?? "*"),
    process: String(input.process),
    granted_by: String(input.granted_by),
    granted_to: String(input.granted_to),
    valid_until: String(input.valid_until),
    acu_limit: Number(input.acu_limit ?? 0),
    timeout_seconds: Number(input.timeout_seconds),
    fs_scope: String(input.fs_scope),
    network_policy: String(input.network_policy),
    ...Object.fromEntries(Object.entries(input).filter(([key]) => ![
      "process", "granted_by", "granted_to", "adapter", "valid_until", "acu_limit", "timeout_seconds", "fs_scope", "network_policy",
    ].includes(key))),
  });
}

export async function authorityRecognized(client: PgClient, identity: string): Promise<boolean> {
  if (!identity.trim()) return false;
  const result = await client.query<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM public.logline_acts a
       WHERE a.did='authority' AND a.this=$1 AND a.status='active'
         AND NOT EXISTS (SELECT 1 FROM public.logline_acts r WHERE r.did='authority-revoke' AND r.this=$1)
     ) AS ok`,
    [identity],
  );
  return !!result.rows[0]?.ok;
}

export async function revokeGrant(client: PgClient, grantId: string, revokedBy: string, reason = "revoked"): Promise<Receipt> {
  return appendAct(client, {
    who: revokedBy,
    did: "grant-revoke",
    this: grantId,
    when: new Date().toISOString(),
    confirmed_by: revokedBy,
    if_ok: "attention-raise.v1",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "revoked",
    reason,
  });
}

async function standing(client: PgClient, grant: Receipt) {
  const grantId = grant.id;
  const [revokedResult, signoffResult] = await Promise.all([
    client.query("SELECT 1 FROM public.logline_acts WHERE did='grant-revoke' AND this=$1 LIMIT 1", [grantId]),
    client.query<{ act: Receipt }>(
      "SELECT act FROM public.logline_acts WHERE did='grant-signoff' AND this=$1 AND status='signed' ORDER BY inserted_at DESC,content_hash DESC LIMIT 1",
      [grantId],
    ),
  ]);
  const signoff = signoffResult.rows[0]?.act ?? null;
  const validUntil = String(grant.valid_until ?? "");
  const expiry = validUntil ? parseIso(validUntil) : null;
  const signer = signoff ? String(signoff.signer ?? signoff.who ?? "") : null;
  const signerMatches = !!signoff && signer === String(grant.granted_by ?? "");
  const cryptographicallyVerified = !!signoff && signoff.verified === true;
  const signoffReason = !signoff
    ? "grant_unsigned"
    : !signerMatches
      ? "signoff_signer_mismatch"
      : !cryptographicallyVerified
        ? "grant_unsigned"
        : "signoff_verified";
  return {
    grant_id: grantId,
    process: grant.process ?? null,
    adapter: grant.adapter ?? null,
    granted_by: grant.granted_by ?? null,
    granted_to: grant.granted_to ?? null,
    valid_until: validUntil || null,
    acu_limit: grant.acu_limit ?? null,
    timeout_seconds: grant.timeout_seconds ?? null,
    fs_scope: grant.fs_scope ?? null,
    network_policy: grant.network_policy ?? null,
    revoked: revokedResult.rowCount ? revokedResult.rowCount > 0 : false,
    expired: expiry != null && expiry <= Date.now(),
    signed_off: signerMatches && cryptographicallyVerified,
    signoff_reason: signoffReason,
    signer,
  };
}

export async function listGrants(client: PgClient, limit = 20) {
  const rows = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE did='grant' ORDER BY inserted_at DESC,content_hash DESC LIMIT $1",
    [limit],
  );
  return Promise.all(rows.rows.map(({ act }) => standing(client, act)));
}

export async function getGrantStanding(client: PgClient, grantId: string) {
  const grant = await getAct(client, grantId);
  if (!grant || grant.did !== "grant") return null;
  return standing(client, grant);
}


export type GrantExecutionCheck = {
  ok: boolean;
  reason: string;
  grant?: Receipt;
};

export async function verifyGrantForExecution(
  client: PgClient,
  grantId: string,
  params: {
    source: Receipt;
    processId: string;
    effectiveAdapter: string | null;
    requiredAcu: number;
    allowedWho?: string[];
  },
): Promise<GrantExecutionCheck> {
  const grant = await getAct(client, grantId);
  if (!grant || grant.did !== "grant") return { ok: false, reason: "grant_not_found" };

  const revoked = await client.query(
    "SELECT 1 FROM public.logline_acts WHERE did='grant-revoke' AND this=$1 LIMIT 1",
    [grantId],
  );
  if ((revoked.rowCount ?? 0) > 0) return { ok: false, reason: "grant_revoked", grant };
  if (grant.status !== "granted") return { ok: false, reason: "grant_not_active", grant };

  if (![params.processId, "*"].includes(String(grant.process ?? ""))) {
    return { ok: false, reason: "grant_process_mismatch", grant };
  }
  if (![String(params.effectiveAdapter ?? ""), "*"].includes(String(grant.adapter ?? ""))) {
    return { ok: false, reason: "grant_adapter_mismatch", grant };
  }

  const sourceWho = String(params.source.who ?? "");
  if (![sourceWho, "*"].includes(String(grant.granted_to ?? ""))) {
    return { ok: false, reason: "grant_subject_mismatch", grant };
  }
  if ((params.allowedWho ?? []).length > 0 && !(params.allowedWho ?? []).includes(sourceWho)) {
    return { ok: false, reason: "who_not_authorized", grant };
  }

  const grantedBy = String(grant.granted_by ?? "").trim();
  if (!grantedBy) return { ok: false, reason: "missing_authority", grant };
  if (!(await authorityRecognized(client, grantedBy))) {
    return { ok: false, reason: "unregistered_authority", grant };
  }

  const validUntil = String(grant.valid_until ?? "").trim();
  const expiry = validUntil ? parseIso(validUntil) : null;
  if (expiry == null) return { ok: false, reason: "missing_grant_expiry", grant };
  if (expiry <= Date.now()) return { ok: false, reason: "grant_expired", grant };
  if (Number(grant.acu_limit ?? 0) < params.requiredAcu) return { ok: false, reason: "budget_exhausted", grant };
  if (Number(grant.timeout_seconds ?? 0) <= 0) return { ok: false, reason: "missing_timeout", grant };
  if (!String(grant.fs_scope ?? "").trim()) return { ok: false, reason: "missing_sandbox_scope", grant };
  if (!NETWORK_POLICIES.has(String(grant.network_policy ?? ""))) {
    return { ok: false, reason: "missing_network_policy", grant };
  }

  const signoffResult = await client.query<{ act: Receipt }>(
    "SELECT act FROM public.logline_acts WHERE did='grant-signoff' AND this=$1 AND status='signed' ORDER BY inserted_at DESC,content_hash DESC LIMIT 1",
    [grantId],
  );
  const signoff = signoffResult.rows[0]?.act;
  if (!signoff || signoff.verified !== true) return { ok: false, reason: "grant_unsigned", grant };
  const signer = String(signoff.signer ?? signoff.who ?? "");
  if (signer !== grantedBy) return { ok: false, reason: "signoff_signer_mismatch", grant };

  return { ok: true, reason: "grant_ok", grant };
}
