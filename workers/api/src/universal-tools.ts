import { canGenericRegisterDid } from "./control-plane";
import { loadContracts } from "./contracts";
import { appendAct, type PgClient } from "./db";
import { evaluate } from "./evaluator";
import { aboutSystem, searchLedger } from "./ledger-registry";
import { registerFlow, registerResponse } from "./register-flow";
import { receiverSelect } from "./runtime";
import { SLOTS, type ActFields } from "./receipt";

const SYSTEM_FIELDS = new Set(["id", "hashes", "receipt_version", "json_canonicalization"]);

export class UniversalToolError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "UniversalToolError";
    this.code = code;
    this.status = status;
  }
}

export async function about(client: PgClient) {
  return aboutSystem(client);
}

export async function search(client: PgClient, query: string, limit = 20) {
  return searchLedger(client, query, limit);
}

/**
 * Universal strict append membrane.
 *
 * The caller supplies the complete semantic proposal. No slot, timestamp, AUX field, or
 * envelope value is invented here. Objective verification happens before persistence via
 * registerFlow; consequence remains a post-append concern.
 */
export async function append(
  client: PgClient,
  proposal: unknown,
  context: { identity?: string } = {},
) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new UniversalToolError("proposal_invalid", "append requires one JSON object proposal");
  }
  const fields = proposal as ActFields;
  for (const key of SYSTEM_FIELDS) {
    if (key in fields) throw new UniversalToolError("system_field_forbidden", `append proposal must not contain ${key}`);
  }
  for (const slot of SLOTS) {
    if (!(slot in fields)) throw new UniversalToolError("slot_missing", `append proposal must explicitly contain ${slot}`);
  }
  if (!("envelope" in fields) || !fields.envelope || typeof fields.envelope !== "object" || Array.isArray(fields.envelope)) {
    throw new UniversalToolError("envelope_required", "append proposal must explicitly contain an envelope object");
  }
  const did = String(fields.did ?? "").trim();
  if (!canGenericRegisterDid(did)) {
    throw new UniversalToolError("reserved_did", `did ${did} requires a dedicated validated server-side flow`, 403);
  }

  const outcome = await registerFlow(client, fields, {
    append: appendAct,
    loadCatalog: loadContracts,
    evaluateReceipt: evaluate,
    selectReceiver: receiverSelect,
  }, context);
  return registerResponse(outcome);
}
