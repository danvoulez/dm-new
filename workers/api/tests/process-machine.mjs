import assert from "node:assert/strict";
import { mintReceipt } from "../src/receipt.ts";
import {
  ProcessMachineError,
  processCurrentState,
  routeProcessReceipt,
  verifyProcessProposal,
} from "../src/process-machine.ts";

const TYPE_HASH = "a".repeat(64);
const definition = {
  process_id: "custody-review.v1",
  start: "intake",
  nodes: {
    intake: {
      activity: "receive and classify the request",
      responsible: "actor:clerk",
      if_ok: "review",
      if_doubt: "stop",
      if_not: "stop",
    },
    review: {
      activity: "review the classified request",
      responsible: "actor:approver",
      if_ok: "stop",
      if_doubt: "intake",
      if_not: "stop",
    },
  },
};

function slots(overrides = {}) {
  return {
    who: "actor:requester",
    did: "opened_process",
    this: "case:42",
    when: "2026-08-21T12:00:00.000Z",
    confirmed_by: "actor:requester",
    if_ok: "continue",
    if_doubt: "clarify",
    if_not: "stop",
    status: "opened",
    ...overrides,
  };
}

const ledger = [];
const custody = [];
let tick = 0;
const client = {
  async query(sql, params = []) {
    if (sql.includes("did='defined_process_type'") && sql.includes("content_hash=$1")) {
      return params[0] === TYPE_HASH
        ? { rows: [{ process_id: definition.process_id, registered_hash: TYPE_HASH, definition }] }
        : { rows: [] };
    }
    if (sql.includes("FROM public.current_process_types") && sql.includes("process_id=$1")) {
      return params[0] === definition.process_id
        ? { rows: [{ process_id: definition.process_id, registered_hash: TYPE_HASH, definition }] }
        : { rows: [] };
    }
    if (sql.includes("WHERE content_hash=$1 AND did='opened_process'")) {
      const row = ledger.find((item) => item.content_hash === params[0] && item.act.did === "opened_process");
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("act->'envelope'->>'process'=$1")) {
      const rows = ledger
        .filter((item) => (item.content_hash === params[0] && item.act.did === "opened_process")
          || item.act.envelope?.process === params[0])
        .sort((a, b) => a.inserted_at.localeCompare(b.inserted_at) || a.tuple_hash.localeCompare(b.tuple_hash));
      return { rows };
    }
    if (sql.includes("INSERT INTO public.runtime_custody_queue")) {
      const [queue_id, process_instance, node, responsible, source_tuple] = params;
      const existing = custody.find((item) => item.process_instance === process_instance && item.node === node && item.source_tuple === source_tuple);
      if (existing) return { rows: [] };
      const row = {
        queue_id,
        process_instance,
        node,
        responsible,
        source_tuple,
        status: "queued",
        claimed_by: null,
        lease_until: null,
        created_at: `2026-08-21T12:00:${String(++tick).padStart(2, "0")}.000Z`,
        updated_at: `2026-08-21T12:00:${String(tick).padStart(2, "0")}.000Z`,
      };
      custody.push(row);
      return { rows: [row] };
    }
    if (sql.includes("FROM public.runtime_custody_queue") && sql.includes("process_instance=$1 AND node=$2 AND source_tuple=$3")) {
      const row = custody.find((item) => item.process_instance === params[0] && item.node === params[1] && item.source_tuple === params[2]);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("UPDATE public.runtime_custody_queue") && sql.includes("source_tuple=$2")) {
      for (const item of custody) {
        if (item.process_instance === params[0] && item.source_tuple === params[1] && item.status !== "closed") {
          item.status = "closed";
          item.claimed_by = null;
          item.lease_until = null;
        }
      }
      return { rows: [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  },
};

async function persist(fields) {
  const act = await mintReceipt(fields);
  ledger.push({
    content_hash: act.id,
    tuple_hash: act.hashes.tuple_hash,
    act,
    inserted_at: `2026-08-21T12:10:${String(ledger.length).padStart(2, "0")}.000Z`,
  });
  return act;
}

const openingFields = {
  ...slots(),
  process_type: TYPE_HASH,
  envelope: {},
};
const openingChecks = await verifyProcessProposal(client, openingFields);
assert.deepEqual(openingChecks, ["opening_process_type_exists", "opening_has_no_self_reference"]);

const opening = await persist(openingFields);
const openingRoute = await routeProcessReceipt(client, opening);
assert.equal(openingRoute.state.process_instance, opening.id, "opening content_hash is process instance identity");
assert.equal(openingRoute.state.current_tuple, opening.hashes.tuple_hash);
assert.equal(openingRoute.state.current_node, "intake");
assert.equal(openingRoute.state.responsible, "actor:clerk");
assert.equal(openingRoute.custody.source_tuple, opening.hashes.tuple_hash);
assert.equal(custody.filter((item) => item.status === "queued").length, 1);

await assert.rejects(
  () => verifyProcessProposal(client, {
    ...slots({ who: "actor:requester", did: "dispatched", status: "ok" }),
    envelope: { process: opening.id, parent: opening.hashes.tuple_hash },
  }),
  (error) => error instanceof ProcessMachineError && error.code === "process_responsible_mismatch",
);

const firstDispatchFields = {
  ...slots({
    who: "actor:clerk",
    did: "dispatched",
    this: "case:42 classified",
    confirmed_by: "actor:clerk",
    status: "ok",
  }),
  envelope: { process: opening.id, parent: opening.hashes.tuple_hash },
};
const dispatchChecks = await verifyProcessProposal(client, firstDispatchFields);
assert.ok(dispatchChecks.includes("process_parent_current"));
assert.ok(dispatchChecks.includes("process_transition_permitted"));

const firstDispatch = await persist(firstDispatchFields);
const firstRoute = await routeProcessReceipt(client, firstDispatch);
assert.equal(firstRoute.state.current_tuple, firstDispatch.hashes.tuple_hash);
assert.equal(firstRoute.state.current_node, "review");
assert.equal(firstRoute.state.responsible, "actor:approver");
assert.equal(firstRoute.state.outcome, "ok");
assert.equal(custody.find((item) => item.source_tuple === opening.hashes.tuple_hash).status, "closed");
assert.equal(custody.find((item) => item.source_tuple === firstDispatch.hashes.tuple_hash).status, "queued");

await assert.rejects(
  () => verifyProcessProposal(client, {
    ...slots({ who: "actor:approver", did: "dispatched", status: "ok" }),
    envelope: { process: opening.id, parent: opening.hashes.tuple_hash },
  }),
  (error) => error instanceof ProcessMachineError && error.code === "process_parent_not_current",
);

await assert.rejects(
  () => verifyProcessProposal(client, {
    ...slots({ who: "actor:approver", did: "dispatched", status: "approved" }),
    envelope: { process: opening.id, parent: firstDispatch.hashes.tuple_hash },
  }),
  (error) => error instanceof ProcessMachineError && error.code === "process_status_not_outcome",
);

const finalDispatch = await persist({
  ...slots({
    who: "actor:approver",
    did: "dispatched",
    this: "case:42 approved",
    confirmed_by: "actor:approver",
    status: "ok",
  }),
  envelope: { process: opening.id, parent: firstDispatch.hashes.tuple_hash },
});
const finalRoute = await routeProcessReceipt(client, finalDispatch);
assert.equal(finalRoute.state.status, "closed");
assert.equal(finalRoute.state.current_node, null);
assert.equal(finalRoute.state.responsible, null);
assert.equal(finalRoute.custody, null);
assert.equal(custody.filter((item) => item.status === "queued").length, 0);

const projected = await processCurrentState(client, opening.id);
assert.equal(projected.status, "closed");
assert.equal(projected.current_tuple, finalDispatch.hashes.tuple_hash);

console.log("process machine: immutable type version + opening identity + tuple ancestry + deterministic custody routing pinned");
