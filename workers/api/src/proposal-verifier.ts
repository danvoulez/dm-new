import type { PgClient } from "./db";
import { SLOTS, type ActFields, type Envelope } from "./receipt";

const HASH = /^[0-9a-f]{64}$/;

export type ProposalVerificationContext = {
  /** Trusted identity from the authenticated request/session boundary, when present. */
  identity?: string;
};

export type ProposalVerification = {
  ok: true;
  checks: string[];
  /** Semantic/content hash references asserted by AUX/citations/envelope.process. */
  referenced_hashes: string[];
  /** Exact occurrence references asserted by envelope.parent. */
  referenced_tuple_hashes: string[];
  process_id: string | null;
};

export class ProposalVerificationError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown>;
  readonly status = 422;

  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "ProposalVerificationError";
    this.code = code;
    this.detail = detail;
  }
}

function fail(code: string, message: string, detail?: Record<string, unknown>): never {
  throw new ProposalVerificationError(code, message, detail);
}

function assertedHash(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("hash_claim_invalid", `${field} must be a 64-hex hash when asserted`, { field, value });
  }
  return value;
}

function explicitContentReferences(fields: ActFields): string[] {
  const refs = new Set<string>();
  const citations = fields.citations;
  if (citations !== undefined) {
    if (!Array.isArray(citations)) fail("citations_invalid", "citations must be an array of 64-hex hashes");
    for (const citation of citations) {
      if (typeof citation !== "string" || !HASH.test(citation)) {
        fail("citation_invalid", "every citation must be a 64-hex hash", { citation });
      }
      refs.add(citation);
    }
  }

  const contractHash = assertedHash(fields.contract_hash, "contract_hash");
  if (contractHash) refs.add(contractHash);

  const envelope = fields.envelope;
  if (envelope !== undefined) {
    if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
      fail("envelope_invalid", "envelope must be a JSON object", { envelope });
    }
    const processHash = assertedHash((envelope as Envelope).process, "envelope.process");
    if (processHash) refs.add(processHash);
  }
  return [...refs];
}

function explicitTupleReferences(fields: ActFields): string[] {
  const envelope = fields.envelope;
  if (envelope === undefined) return [];
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("envelope_invalid", "envelope must be a JSON object", { envelope });
  }
  const parent = assertedHash((envelope as Envelope).parent, "envelope.parent");
  return parent ? [parent] : [];
}

async function requireContentHashes(client: PgClient, refs: string[]): Promise<void> {
  if (!refs.length) return;
  const result = await client.query<{ content_hash: string }>(
    "SELECT DISTINCT content_hash FROM public.logline_acts WHERE content_hash = ANY($1::text[])",
    [refs],
  );
  const found = new Set(result.rows.map((row) => row.content_hash));
  const missing = refs.filter((hash) => !found.has(hash));
  if (missing.length) fail("hash_not_found", "one or more referenced content hashes do not exist", { missing });
}

async function requireTupleHashes(client: PgClient, refs: string[]): Promise<void> {
  if (!refs.length) return;
  const result = await client.query<{ tuple_hash: string }>(
    "SELECT tuple_hash FROM public.logline_acts WHERE tuple_hash = ANY($1::text[])",
    [refs],
  );
  const found = new Set(result.rows.map((row) => row.tuple_hash));
  const missing = refs.filter((hash) => !found.has(hash));
  if (missing.length) fail("parent_tuple_not_found", "one or more envelope parent tuple hashes do not exist", { missing });
}

async function requireProcessType(client: PgClient, processId: string): Promise<string | null> {
  try {
    const projected = await client.query<{ process_id: string; registered_hash: string | null }>(
      "SELECT process_id,registered_hash FROM public.current_process_types WHERE process_id=$1 LIMIT 1",
      [processId],
    );
    if (projected.rows[0]) return projected.rows[0].registered_hash ?? null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/current_process_types|does not exist|undefined table/i.test(detail)) throw error;
  }

  // Transitional fallback only for installations that have not emitted/imported type Acts.
  const legacy = await client.query<{ process_id: string; registered_hash: string | null }>(
    "SELECT process_id,registered_hash FROM public.process_contracts WHERE process_id=$1 LIMIT 1",
    [processId],
  );
  const row = legacy.rows[0];
  if (!row) fail("process_type_not_found", `process type does not exist: ${processId}`, { process_id: processId });
  return row.registered_hash ?? null;
}

/**
 * Verify a proposed Act before it is appended.
 *
 * This is intentionally not a semantic validator. The nine fields, AUX and envelope
 * semantics are LLM territory. We verify only structural facts and claims the runtime can
 * know objectively. Crucially, envelope.process is a content-hash claim while
 * envelope.parent is a tuple-hash claim; the kernel never conflates those identity domains.
 */
export async function verifyProposal(
  client: PgClient,
  fields: ActFields,
  context: ProposalVerificationContext = {},
): Promise<ProposalVerification> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    fail("proposal_invalid", "proposal must be a JSON object");
  }

  for (const slot of SLOTS) {
    if (!(slot in fields)) fail("slot_missing", `proposal must explicitly contain slot ${slot}`, { slot });
    if (typeof fields[slot] !== "string") fail("slot_type", `proposal slot ${slot} must be a string`, { slot });
  }

  const checks = ["tuple_shape"];
  const identity = String(context.identity ?? "").trim();
  if (identity) {
    if (fields.who !== identity) {
      fail("who_identity_mismatch", "proposed who does not match the authenticated session identity", {
        expected: identity,
        observed: fields.who,
      });
    }
    checks.push("session_identity");
  }

  const assertedWhen = String(fields.when ?? "").trim();
  if (assertedWhen) {
    const timestamp = Date.parse(assertedWhen);
    if (Number.isNaN(timestamp)) fail("when_invalid", "when must be a parseable timestamp when asserted", { when: assertedWhen });
    checks.push("when_parseable");
  }

  const contentRefs = explicitContentReferences(fields);
  await requireContentHashes(client, contentRefs);
  if (contentRefs.length) checks.push("referenced_content_hashes_exist");

  const tupleRefs = explicitTupleReferences(fields);
  await requireTupleHashes(client, tupleRefs);
  if (tupleRefs.length) checks.push("parent_tuple_hashes_exist");

  const processId = typeof fields.process_id === "string" ? fields.process_id.trim() : "";
  if (processId) {
    const registeredHash = await requireProcessType(client, processId);
    checks.push("process_type_exists");

    const suppliedContractHash = typeof fields.contract_hash === "string" ? fields.contract_hash.trim() : "";
    if (suppliedContractHash) {
      if (suppliedContractHash !== registeredHash) {
        fail("contract_hash_mismatch", "contract_hash is not the registered hash for the proposed process type", {
          process_id: processId,
          expected: registeredHash,
          observed: suppliedContractHash,
        });
      }
      checks.push("contract_hash_current");
    }
  }

  return {
    ok: true,
    checks,
    referenced_hashes: contentRefs,
    referenced_tuple_hashes: tupleRefs,
    process_id: processId || null,
  };
}
