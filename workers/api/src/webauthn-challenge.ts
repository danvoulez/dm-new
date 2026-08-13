export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * grant_id is the canonical SHA-256 content hash encoded as 64 lowercase hex chars.
 * WebAuthn signs the raw 32 digest bytes, matching the Python kernel seam.
 */
export function contentHashChallenge(contentHash: string): string {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error("content_hash_not_hex");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = Number.parseInt(contentHash.slice(i * 2, i * 2 + 2), 16);
  return toBase64Url(bytes);
}

/** A strictly lower authenticator counter is clone/replay evidence.
 * Equal zero is allowed because many synced passkeys do not implement counters.
 */
export function signCountRegressed(current: number, next: number): boolean {
  if (!Number.isFinite(current) || !Number.isFinite(next) || current < 0 || next < 0) return true;
  return next < current;
}

export function clientDataChallenge(clientDataJSON: string): string | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(clientDataJSON))) as { challenge?: unknown };
    return typeof parsed.challenge === "string" && parsed.challenge ? parsed.challenge : null;
  } catch {
    return null;
  }
}

export function validateGrantAssertionEnvelope(params: {
  grantId: string;
  responseId: string;
  clientDataJSON: string;
  credentialId: string;
}): { ok: true; challenge: string } | { ok: false; detail: "grant_challenge_mismatch" | "credential_id_mismatch" } {
  const challenge = clientDataChallenge(params.clientDataJSON);
  if (!challenge || challenge !== contentHashChallenge(params.grantId)) {
    return { ok: false, detail: "grant_challenge_mismatch" };
  }
  if (params.responseId !== params.credentialId) {
    return { ok: false, detail: "credential_id_mismatch" };
  }
  return { ok: true, challenge };
}
