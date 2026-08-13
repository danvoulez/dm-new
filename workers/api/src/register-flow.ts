import type { PgClient } from "./db";
import type { ProcessContract } from "./contracts";
import { evaluate, type Evaluation } from "./evaluator";
import { renderMessage } from "./messages";
import type { ActFields, Receipt } from "./receipt";

export type RegisterOutcome = {
  receipt: Receipt;
  decision: Evaluation;
  queued: boolean;
};


export class RegisterActivationError extends Error {
  readonly receipt: Receipt;
  readonly causeDetail: string;

  constructor(receipt: Receipt, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`registration persisted but activation failed: ${detail}`);
    this.name = "RegisterActivationError";
    this.receipt = receipt;
    this.causeDetail = detail;
  }
}

export type RegisterFlowDeps = {
  append: (client: PgClient, fields: ActFields) => Promise<Receipt>;
  loadCatalog: (client: PgClient) => Promise<Map<string, ProcessContract>>;
  evaluateReceipt: typeof evaluate;
  selectReceiver: (client: PgClient, frequency: string, limit?: number) => Promise<Array<{ hash: string; evaluation: Evaluation; queued: unknown; doubt: unknown }>>;
};

/**
 * Authoritative register pipeline: append first, then evaluate, then receiver-select.
 * Registration and activation are intentionally separate facts. If receiver selection
 * fails, the caller may report that the append succeeded while runtime activation did not.
 */
export async function registerFlow(
  client: PgClient,
  fields: ActFields,
  deps: RegisterFlowDeps,
): Promise<RegisterOutcome> {
  const receipt = await deps.append(client, fields);
  try {
    const catalog = await deps.loadCatalog(client);
    let decision = deps.evaluateReceipt(receipt, catalog);
    let queued = false;

    const frequency = String(receipt.if_ok ?? "");
    if (frequency) {
      const selected = await deps.selectReceiver(client, frequency, 50);
      const current = selected.find((item) => item.hash === receipt.id);
      if (current) {
        decision = current.evaluation;
        queued = !!current.queued;
      }
    }

    return { receipt, decision, queued };
  } catch (error) {
    throw new RegisterActivationError(receipt, error);
  }
}

export function registerResponse(outcome: RegisterOutcome) {
  const { receipt, decision, queued } = outcome;
  const response: Record<string, unknown> = {
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
