import type { PgClient } from "./db";
import type { ProcessContract } from "./contracts";
import { evaluate, type Evaluation } from "./evaluator";
import { renderMessage } from "./messages";
import type { ActFields, Receipt } from "./receipt";
import type { ProposalVerification, ProposalVerificationContext } from "./proposal-verifier";
import { verifyProposal } from "./proposal-verifier";

export type RegisterOutcome = {
  verification: ProposalVerification;
  receipt: Receipt;
  decision: Evaluation;
  queued: boolean;
  /** Optional v1.2 process-instance/custody consequence derived after append. */
  process_route?: unknown;
};

export class RegisterActivationError extends Error {
  readonly receipt: Receipt;
  readonly causeDetail: string;

  constructor(receipt: Receipt, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`registration persisted but consequence failed: ${detail}`);
    this.name = "RegisterActivationError";
    this.receipt = receipt;
    this.causeDetail = detail;
  }
}

export type RegisterFlowDeps = {
  /** Injectable for tests; production defaults to the kernel verifier. */
  verifyProposal?: typeof verifyProposal;
  append: (client: PgClient, fields: ActFields) => Promise<Receipt>;
  loadCatalog: (client: PgClient) => Promise<Map<string, ProcessContract>>;
  evaluateReceipt: typeof evaluate;
  selectReceiver: (client: PgClient, frequency: string, limit?: number) => Promise<Array<{ hash: string; evaluation: Evaluation; queued: unknown; doubt: unknown }>>;
  /** Phase 3 deterministic route projection; never authors or appends a semantic Act. */
  routeProcessReceipt?: (client: PgClient, receipt: Receipt) => Promise<unknown>;
};

function routeObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * A non-null process route means the custody engine recognized and owns this Act's
 * consequence path. Do not ask the legacy evaluator to reinterpret it afterwards.
 */
function custodyDecision(route: unknown): Evaluation | null {
  const processRoute = routeObject(route);
  const state = routeObject(processRoute?.state);
  if (!state) return null;
  const custody = routeObject(processRoute?.custody);
  const open = state.status === "open";
  return {
    activate: open,
    matched: true,
    reason: open ? "process_custody_routed" : "process_closed",
    process_id: typeof state.process_id === "string" ? state.process_id : null,
    adapter: null,
    missing_slots: [],
    missing_aux: [],
    registration_state: "registered",
    activation_state: open ? "custody" : "closed",
    queueable: Boolean(custody),
    process_state: state,
  };
}

/**
 * Authoritative v1.2 register pipeline:
 * proposal -> objective verify -> append -> route/evaluate -> effect.
 *
 * Verification failure happens before persistence and is fail-loud. Once append
 * succeeds, the receipt is immutable even if consequence derivation/runtime later
 * fails; callers may report that separate post-append failure without rewriting the Act.
 *
 * Custody routing has consequence precedence for migrated process types. The legacy
 * process_id/evaluator path is a compatibility fallback only when routeProcessReceipt
 * returns no recognized process state.
 */
export async function registerFlow(
  client: PgClient,
  fields: ActFields,
  deps: RegisterFlowDeps,
  context: ProposalVerificationContext = {},
): Promise<RegisterOutcome> {
  const verification = await (deps.verifyProposal ?? verifyProposal)(client, fields, context);
  const receipt = await deps.append(client, fields);
  try {
    const processRoute = deps.routeProcessReceipt
      ? await deps.routeProcessReceipt(client, receipt)
      : undefined;
    const routedDecision = custodyDecision(processRoute);
    if (routedDecision) {
      const processRouteObject = routeObject(processRoute);
      return {
        verification,
        receipt,
        decision: routedDecision,
        queued: Boolean(routeObject(processRouteObject?.custody)),
        process_route: processRoute,
      };
    }

    const catalog = await deps.loadCatalog(client);
    let decision = deps.evaluateReceipt(receipt, catalog);
    let queued = false;

    const frequency = String(receipt.process_id ?? "");
    if (frequency) {
      const selected = await deps.selectReceiver(client, frequency, 50);
      const current = selected.find((item) => item.hash === receipt.id);
      if (current) {
        decision = current.evaluation;
        queued = !!current.queued;
      }
    }

    return {
      verification,
      receipt,
      decision,
      queued,
      ...(processRoute === undefined ? {} : { process_route: processRoute }),
    };
  } catch (error) {
    throw new RegisterActivationError(receipt, error);
  }
}

export function registerResponse(outcome: RegisterOutcome) {
  const { verification, receipt, decision, queued } = outcome;
  const envelopeHash = "envelope_hash" in receipt.hashes ? receipt.hashes.envelope_hash : null;
  const processRoute = routeObject(outcome.process_route);
  const processState = routeObject(processRoute?.state);
  const custody = routeObject(processRoute?.custody);
  const processActivated = Boolean(processState && processState.status === "open");
  const response: Record<string, unknown> = {
    verified: true,
    verification_checks: verification.checks,
    registered: true,
    id: receipt.id,
    content_hash: receipt.hashes.content_hash,
    tuple_hash: receipt.hashes.tuple_hash,
    envelope_hash: envelopeHash,
    fingerprint: receipt.id.slice(0, 8),
    tuple_fingerprint: receipt.hashes.tuple_hash.slice(0, 8),
    activated: !!decision.activate || processActivated,
    process_id: processState?.process_id ?? decision.process_id ?? null,
    process_instance: processState?.process_instance ?? null,
    queued: queued || Boolean(custody),
    ...(processState ? { process_state: processState } : {}),
    ...(custody ? { custody } : {}),
  };
  if (!decision.activate && !processState) {
    response.waiting = renderMessage(String(decision.reason || "unknown"), decision);
    response.missing = decision.missing_aux?.length ? decision.missing_aux : decision.missing_slots;
  }
  return response;
}
