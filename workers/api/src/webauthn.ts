import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { appendAct, getAct, type PgClient } from "./db";
import { authorityRecognized } from "./grants";
import type { Receipt } from "./receipt";
import { clientDataChallenge, contentHashChallenge, fromBase64Url, signCountRegressed, toBase64Url, validateGrantAssertionEnvelope } from "./webauthn-challenge";

export type WebAuthnEnv = {
  PROJECTIONS: D1Database;
  WEBAUTHN_RP_ID?: string;
  WEBAUTHN_ORIGIN?: string;
  WEBAUTHN_RP_NAME?: string;
};

export type AuthenticatorEnrollment = {
  enrollment_hash: string;
  identity: string;
  credential_id: string;
  public_key: string;
  rp_id: string;
  origin: string;
  sign_count: number;
  transports: AuthenticatorTransportFuture[];
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function config(env: WebAuthnEnv) {
  return {
    rpID: (env.WEBAUTHN_RP_ID || "carbonlab.work").trim(),
    origin: (env.WEBAUTHN_ORIGIN || "https://app.carbonlab.work").replace(/\/+$/, ""),
    rpName: (env.WEBAUTHN_RP_NAME || "Dream").trim(),
  };
}

function responseChallenge(response: RegistrationResponseJSON | AuthenticationResponseJSON): string | null {
  return clientDataChallenge(response.response.clientDataJSON);
}

function normalizeReceipt(value: unknown): Receipt | null {
  if (!value || typeof value !== "object") return null;
  return value as Receipt;
}

async function storeChallenge(
  db: D1Database,
  params: { challenge: string; identity: string; kind: "enroll" | "sign"; grantId?: string | null },
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  if (params.kind === "enroll") {
    await db.prepare("UPDATE webauthn_challenges SET used=1 WHERE identity=? AND kind='enroll' AND used=0")
      .bind(params.identity)
      .run();
  }

  // Sign challenges are deterministic (the grant content hash), so an already-used
  // challenge must never be resurrected. INSERT OR IGNORE + a guarded refresh lets a
  // cancelled, still-unused ceremony be re-issued while keeping consumption monotonic.
  const inserted = await db.prepare(
    `INSERT OR IGNORE INTO webauthn_challenges(challenge, identity, kind, grant_id, expires_at, used)
     VALUES(?,?,?,?,?,0)`,
  ).bind(params.challenge, params.identity, params.kind, params.grantId ?? null, expiresAt).run();
  if (Number(inserted.meta?.changes ?? 0) === 1) return true;

  const refreshed = await db.prepare(
    `UPDATE webauthn_challenges
     SET expires_at=?
     WHERE challenge=? AND identity=? AND kind=?
       AND COALESCE(grant_id,'')=COALESCE(?, '')
       AND used=0`,
  ).bind(expiresAt, params.challenge, params.identity, params.kind, params.grantId ?? null).run();
  return Number(refreshed.meta?.changes ?? 0) === 1;
}

async function consumeChallenge(
  db: D1Database,
  params: { challenge: string; identity: string; kind: "enroll" | "sign"; grantId?: string | null },
): Promise<boolean> {
  const now = new Date().toISOString();
  const statement = params.kind === "sign"
    ? db.prepare(
      `UPDATE webauthn_challenges
       SET used=1
       WHERE challenge=? AND identity=? AND kind='sign' AND grant_id=? AND used=0 AND expires_at>?`,
    ).bind(params.challenge, params.identity, params.grantId ?? "", now)
    : db.prepare(
      `UPDATE webauthn_challenges
       SET used=1
       WHERE challenge=? AND identity=? AND kind='enroll' AND used=0 AND expires_at>?`,
    ).bind(params.challenge, params.identity, now);
  const result = await statement.run();
  return Number(result.meta?.changes ?? 0) === 1;
}

export async function getAuthenticator(client: PgClient, identity: string): Promise<AuthenticatorEnrollment | null> {
  const result = await client.query<{ content_hash: string; act: unknown }>(
    `SELECT content_hash, act
     FROM public.logline_acts
     WHERE did='authenticator-enroll' AND this=$1 AND status='active'
     ORDER BY inserted_at DESC, content_hash DESC`,
    [identity],
  );
  for (const row of result.rows) {
    const revoked = await client.query(
      "SELECT 1 FROM public.logline_acts WHERE did='authenticator-revoke' AND this=$1 LIMIT 1",
      [row.content_hash],
    );
    if ((revoked.rowCount ?? 0) > 0) continue;
    const act = normalizeReceipt(row.act);
    if (!act) continue;
    const counterResult = await client.query<{ act: unknown }>(
      `SELECT act
       FROM public.logline_acts
       WHERE did='authenticator-counter' AND this=$1 AND status='active'
       ORDER BY inserted_at DESC, content_hash DESC LIMIT 1`,
      [row.content_hash],
    );
    const counterAct = normalizeReceipt(counterResult.rows[0]?.act);
    const transports = Array.isArray(act.transports)
      ? act.transports.filter((value): value is AuthenticatorTransportFuture => typeof value === "string")
      : [];
    return {
      enrollment_hash: row.content_hash,
      identity,
      credential_id: String(act.credential_id ?? ""),
      public_key: String(act.public_key ?? ""),
      rp_id: String(act.rp_id ?? ""),
      origin: String(act.origin ?? ""),
      sign_count: Number(counterAct?.sign_count ?? act.sign_count ?? 0),
      transports,
    };
  }
  return null;
}

export async function createEnrollmentOptions(env: WebAuthnEnv, client: PgClient, identity: string) {
  if (!(await authorityRecognized(client, identity))) {
    return { ok: false as const, code: "unregistered_authority" as const };
  }
  const { rpID, rpName } = config(env);
  const existing = await getAuthenticator(client, identity);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: identity,
    userDisplayName: identity,
    timeout: CHALLENGE_TTL_MS,
    attestationType: "none",
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: existing?.credential_id
      ? [{ id: existing.credential_id, transports: existing.transports }]
      : [],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  });
  const stored = await storeChallenge(env.PROJECTIONS, { challenge: options.challenge, identity, kind: "enroll" });
  if (!stored) return { ok: false as const, code: "signature_invalid" as const, detail: "challenge_reuse_blocked" };
  return { ok: true as const, options };
}

export async function verifyEnrollment(
  env: WebAuthnEnv,
  client: PgClient,
  identity: string,
  response: RegistrationResponseJSON,
) {
  if (!(await authorityRecognized(client, identity))) {
    return { ok: false as const, code: "unregistered_authority" as const };
  }
  const challenge = responseChallenge(response);
  if (!challenge || !(await consumeChallenge(env.PROJECTIONS, { challenge, identity, kind: "enroll" }))) {
    return { ok: false as const, code: "signature_invalid" as const, detail: "challenge_missing_expired_or_used" };
  }
  const { rpID, origin } = config(env);
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return { ok: false as const, code: "signature_invalid" as const, detail: "registration_not_verified" };
    }
    const info = verification.registrationInfo;
    const credential = info.credential;
    const receipt = await appendAct(client, {
      who: identity,
      did: "authenticator-enroll",
      this: identity,
      when: new Date().toISOString(),
      confirmed_by: identity,
      if_ok: "authenticator-active.v1",
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "active",
      credential_id: credential.id,
      public_key: toBase64Url(credential.publicKey),
      rp_id: rpID,
      origin,
      sign_count: Number(credential.counter ?? 0),
      transports: credential.transports ?? [],
      credential_device_type: info.credentialDeviceType,
      credential_backed_up: info.credentialBackedUp,
    });
    return {
      ok: true as const,
      verified: true,
      enrolled: true,
      id: receipt.id,
      credential_id: credential.id,
    };
  } catch (error) {
    return { ok: false as const, code: "signature_invalid" as const, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function createSignOptions(env: WebAuthnEnv, client: PgClient, identity: string, grantId: string) {
  const grant = await getAct(client, grantId);
  if (!grant || grant.did !== "grant") return { ok: false as const, code: "not_found" as const };
  if (String(grant.granted_by ?? "") !== identity) {
    return { ok: false as const, code: "signoff_signer_mismatch" as const };
  }
  if (!(await authorityRecognized(client, identity))) {
    return { ok: false as const, code: "unregistered_authority" as const };
  }
  const authenticator = await getAuthenticator(client, identity);
  if (!authenticator?.credential_id || !authenticator.public_key) {
    return { ok: false as const, code: "grant_unsigned" as const };
  }
  const { rpID } = config(env);
  // Kernel parity: grant_id already is SHA-256(receipt), so challenge bytes are the raw 32-byte digest.
  const challenge = contentHashChallenge(grantId);
  const options = await generateAuthenticationOptions({
    rpID,
    challenge: fromBase64Url(challenge),
    timeout: CHALLENGE_TTL_MS,
    userVerification: "required",
    allowCredentials: [{ id: authenticator.credential_id, transports: authenticator.transports }],
  });
  const stored = await storeChallenge(env.PROJECTIONS, { challenge: options.challenge, identity, kind: "sign", grantId });
  if (!stored) return { ok: false as const, code: "signature_invalid" as const, detail: "challenge_already_consumed" };
  return { ok: true as const, options };
}

async function recordCounter(client: PgClient, enrollment: AuthenticatorEnrollment, identity: string, newCounter: number) {
  return appendAct(client, {
    who: identity,
    did: "authenticator-counter",
    this: enrollment.enrollment_hash,
    when: new Date().toISOString(),
    confirmed_by: identity,
    if_ok: "authenticator-active.v1",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "active",
    credential_id: enrollment.credential_id,
    sign_count: newCounter,
  });
}

export async function verifyGrantSignoff(
  env: WebAuthnEnv,
  client: PgClient,
  identity: string,
  grantId: string,
  response: AuthenticationResponseJSON,
) {
  const grant = await getAct(client, grantId);
  if (!grant || grant.did !== "grant") return { ok: false as const, code: "not_found" as const };
  if (String(grant.granted_by ?? "") !== identity) {
    return { ok: false as const, code: "signoff_signer_mismatch" as const };
  }
  if (!(await authorityRecognized(client, identity))) {
    return { ok: false as const, code: "unregistered_authority" as const };
  }
  const authenticator = await getAuthenticator(client, identity);
  if (!authenticator?.credential_id || !authenticator.public_key) {
    return { ok: false as const, code: "grant_unsigned" as const };
  }
  const envelope = validateGrantAssertionEnvelope({
    grantId,
    responseId: response.id,
    clientDataJSON: response.response.clientDataJSON,
    credentialId: authenticator.credential_id,
  });
  if (!envelope.ok) {
    return { ok: false as const, code: "signature_invalid" as const, detail: envelope.detail };
  }
  const challenge = envelope.challenge;
  // Burn the ceremony before any cryptographic verification attempt, including failures.
  if (!(await consumeChallenge(env.PROJECTIONS, { challenge, identity, kind: "sign", grantId }))) {
    return { ok: false as const, code: "signature_invalid" as const, detail: "challenge_missing_expired_or_used" };
  }
  try {
    const credential: WebAuthnCredential = {
      id: authenticator.credential_id,
      publicKey: fromBase64Url(authenticator.public_key),
      counter: authenticator.sign_count,
      transports: authenticator.transports,
    };
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: authenticator.origin || config(env).origin,
      expectedRPID: authenticator.rp_id || config(env).rpID,
      credential,
      requireUserVerification: true,
    });
    if (!verification.verified) {
      return { ok: false as const, code: "signature_invalid" as const, detail: "assertion_not_verified" };
    }
    const newCounter = Number(verification.authenticationInfo.newCounter ?? authenticator.sign_count);
    if (signCountRegressed(authenticator.sign_count, newCounter)) {
      return { ok: false as const, code: "signature_invalid" as const, detail: "sign_count_regressed" };
    }
    await recordCounter(client, authenticator, identity, newCounter);
    const signoff = await appendAct(client, {
      who: identity,
      did: "grant-signoff",
      this: grantId,
      when: new Date().toISOString(),
      confirmed_by: identity,
      if_ok: "grant-armed.v1",
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "signed",
      signer: identity,
      credential: response,
      credential_id: authenticator.credential_id,
      verified: true,
      sign_count: newCounter,
    });
    return { ok: true as const, verified: true, signed_off: true, id: signoff.id, sign_count: newCounter };
  } catch (error) {
    return { ok: false as const, code: "signature_invalid" as const, detail: error instanceof Error ? error.message : String(error) };
  }
}
