export const NETWORK_POLICIES = new Set(["none", "restricted", "open"]);

export type GrantInput = {
  process?: string;
  granted_by?: string;
  granted_to?: string;
  adapter?: string;
  valid_until?: string;
  acu_limit?: number;
  timeout_seconds?: number;
  fs_scope?: string;
  network_policy?: string;
  [key: string]: unknown;
};

function validIso(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function validateGrantInput(input: GrantInput): string | null {
  if (!String(input.process ?? "").trim()) return "process";
  if (!String(input.granted_by ?? "").trim()) return "granted_by";
  if (!String(input.granted_to ?? "").trim()) return "granted_to";
  const validUntil = String(input.valid_until ?? "").trim();
  if (!validUntil || !validIso(validUntil)) return "valid_until";
  if (!Number.isFinite(Number(input.timeout_seconds)) || Number(input.timeout_seconds) <= 0) return "timeout_seconds";
  if (!String(input.fs_scope ?? "").trim()) return "fs_scope";
  if (!NETWORK_POLICIES.has(String(input.network_policy ?? ""))) return "network_policy";
  return null;
}
