/**
 * Receipts that may only be emitted by validated, server-side flows.
 * The generic /api/register endpoint must never mint these directly.
 */
export const RESERVED_REGISTER_DIDS = new Set([
  "authority",
  "authority-revoke",
  "authenticator-enroll",
  "authenticator-revoke",
  "authenticator-counter",
  "grant",
  "grant-revoke",
  "grant-signoff",
  "queued",
  "dispatching",
  "doubt",
  "not_dispatched",
  "adapter_doubted",
  "evidence_incomplete",
  "fechado",
  "llm.receipt",
]);

export function canGenericRegisterDid(did: string): boolean {
  return !RESERVED_REGISTER_DIDS.has(did.trim());
}
