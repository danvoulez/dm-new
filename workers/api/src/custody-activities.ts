import type { ActFields, Receipt } from "./receipt";
import type { CustodyQueueItem, ProcessCurrentState } from "./process-machine";

/**
 * Activity handlers are effect/scribe modules, not kernel semantics.
 * A handler must return the complete 9-slot + AUX + envelope proposal it owns.
 */
export type CustodyActivityContext = {
  source: Receipt;
  custody: CustodyQueueItem;
  state: ProcessCurrentState;
  worker: string;
  now: string;
};

export type CustodyActivityHandler = (context: CustodyActivityContext) => Promise<ActFields>;

async function receiptActivity(context: CustodyActivityContext): Promise<ActFields> {
  const { source, custody, state, worker, now } = context;
  return {
    who: custody.responsible,
    did: "recorded_receipt_activity",
    this: custody.source_tuple,
    when: now,
    confirmed_by: worker,
    if_ok: "continue",
    if_doubt: "review",
    if_not: "stop",
    status: "ok",
    activity: "receipt",
    source_tuple: custody.source_tuple,
    source_content_hash: source.id,
    executor_worker: worker,
    external_effect: false,
    citations: [source.id],
    envelope: {
      process: state.process_instance,
      parent: custody.source_tuple,
    },
  };
}

/**
 * Keep this registry intentionally tiny. Human/team custody is not an executable
 * activity, and unknown activity strings are never guessed or coerced into adapters.
 */
export const CUSTODY_ACTIVITY_HANDLERS = new Map<string, CustodyActivityHandler>([
  ["receipt", receiptActivity],
]);

export const REGISTERED_CUSTODY_ACTIVITIES = new Set(CUSTODY_ACTIVITY_HANDLERS.keys());
