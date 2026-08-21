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
};

/**
 * Authoritative v1.2 register pipeline:
 * proposal -> objective verify -> append -> route/evaluate -> effect.
 *
 * Verification failure happens before persistence and is fail-loud. Once append
 * succeeds, the receipt is immutable even if consequence derivation/runtime later
 * fails; callers may report that separate post-append failure without rewriting the Act.
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

    return { verification, receipt, decision, queued };
  } catch (error) {
    throw new RegisterActivationError(receipt, error);
  }
}

export function registerResponse(outcome: RegisterOutcome) {
  const { verification, receipt, decision, queued } = outcome;
  const response: Record<string, unknown> = {
    verified: true,
    verification_checks: verification.checks,
    registered: true,
    id: receipt.id,
    fingerprint: receipt.id.slice(0, 8),
    activated: !!decision.activate,
    process_id: decision.process_id ?? null,
    queued,
  };
  if (!decision.activate) {
    response.waiting = renderMessage(String(decision.reason || "unknown"), decision);
    response.missing = decision.missing_aux?.length ? decision.missing_aux : decision.missing_slots;
  }
  return response;
}
