import { canGenericRegisterDid } from "./control-plane";
import { loadContracts } from "./contracts";
import { appendAct, type PgClient } from "./db";
import { evaluate } from "./evaluator";
import { aboutSystem, searchLedger } from "./ledger-registry";
import { legacyReceiverSelect } from "./legacy-runtime";
import { currentCustody } from "./process-inspect";
import { processCurrentState, routeProcessReceipt } from "./process-machine";
import { registerFlow, registerResponse } from "./register-flow";
import { SLOTS, type ActFields } from "./receipt";

const SYSTEM_FIELDS = new Set(["id", "hashes", "receipt_version", "json_canonicalization"]);
const HASH = /^[0-9a-f]{64}$/;

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
  const result = await searchLedger(client, query, limit);
  const exact = query.trim();
  if (!HASH.test(exact)) return result;
  const processState = await processCurrentState(client, exact);
  if (!processState) return result;
  const candidate = await currentCustody(client, exact);
  const custody = candidate
    && processState.status === "open"
    && candidate.node === processState.current_node
    && candidate.responsible === processState.responsible
    && candidate.source_tuple === processState.current_tuple
    ? candidate
    : null;
  return {
    ...result,
    process_instance: processState,
    custody,
  };
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
    selectReceiver: legacyReceiverSelect,
    routeProcessReceipt,
  }, context);
  return registerResponse(outcome);
}
