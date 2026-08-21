import assert from "node:assert/strict";
import { claimCustody, CustodyExecutionError, custodyExecutorRunOnce } from "../src/custody-executor.ts";
import { executorRunOnce } from "../src/runtime.ts";
import { mintReceipt } from "../src/receipt.ts";

const INSTANCE = "a".repeat(64);
const TYPE_HASH = "b".repeat(64);
const OPENED = "c".repeat(64);
const SOURCE_TUPLE = "d".repeat(64);

function queue(overrides = {}) {
  return {
    queue_id: "custody:test",
    process_instance: INSTANCE,
    node: "execute",
    responsible: "runtime.executor",
    source_tuple: SOURCE_TUPLE,
    status: "claimed",
    claimed_by: "worker:test",
    lease_until: "2026-08-21T17:40:00.000Z",
    created_at: "2026-08-21T17:30:00.000Z",
    updated_at: "2026-08-21T17:31:00.000Z",
    attempts: 1,
    last_error: null,
    result_tuple: null,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    process_instance: INSTANCE,
    process_type: TYPE_HASH,
    process_id: "auto-receipt.v1",
    opened_tuple: OPENED,
    current_tuple: SOURCE_TUPLE,
    current_node: "execute",
    responsible: "runtime.executor",
    activity: "receipt",
    status: "open",
    outcome: null,
    ...overrides,
  };
}

function processType(activity = "receipt", definition = {}) {
  return {
    process_id: "auto-receipt.v1",
    registered_hash: TYPE_HASH,
    start: "execute",
    nodes: new Map([
      ["execute", { id: "execute", activity, responsible: "runtime.executor", if_ok: "stop", if_doubt: "stop", if_not: "stop" }],
    ]),
    definition,
  };
}

const source = await mintReceipt({
  who: "operator",
  did: "requested",
  this: "make an internal receipt",
  when: "2026-08-21T17:30:00.000Z",
  confirmed_by: "operator",
  if_ok: "continue",
  if_doubt: "review",
  if_not: "stop",
  status: "ok",
  envelope: {},
});

// Claim is responsibility-scoped, lease-based, and concurrency-safe.
{
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [queue()], rowCount: 1 };
    },
  };
  const claimed = await claimCustody(client, "runtime.executor", "worker:test", 45);
  assert.equal(claimed.queue_id, "custody:test");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["runtime.executor", "worker:test", 45]);
  assert.match(calls[0].sql, /responsible=\$1/i);
  assert.match(calls[0].sql, /status='queued'/i);
  assert.match(calls[0].sql, /status='claimed'.*lease_until.*now\(\)/is);
  assert.match(calls[0].sql, /for update skip locked/i);
  assert.match(calls[0].sql, /attempts=coalesce\(q\.attempts,0\)\+1/i);
}

// A current receipt activity authors a complete result proposal and closes the runtime claim.
{
  const calls = [];
  let proposalSeen = null;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/WITH next AS/i.test(sql)) return { rows: [queue()], rowCount: 1 };
      if (/result_tuple=\$2/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const result = await custodyExecutorRunOnce(client, "runtime.executor", "worker:test", 60, {
    project: async () => state(),
    sourceByTuple: async (_client, tuple) => {
      assert.equal(tuple, SOURCE_TUPLE);
      return source;
    },
    loadType: async () => processType("receipt", { evidence_must_include: ["source_tuple", "source_content_hash"] }),
    verifyGrant: async () => { throw new Error("L0 receipt activity must not require a grant"); },
    now: () => "2026-08-21T17:32:00.000Z",
    appendProposal: async (_client, proposal, responsible) => {
      proposalSeen = proposal;
      assert.equal(responsible, "runtime.executor");
      return mintReceipt(proposal);
    },
  });
  assert.equal(result.kind, "custody");
  assert.equal(result.activity, "receipt");
  assert.match(result.result_tuple, /^[0-9a-f]{64}$/);
  assert.equal(proposalSeen.who, "runtime.executor");
  assert.equal(proposalSeen.status, "ok");
  assert.deepEqual(proposalSeen.envelope, { process: INSTANCE, parent: SOURCE_TUPLE });
  assert.equal(proposalSeen.source_tuple, SOURCE_TUPLE);
  assert.equal(proposalSeen.source_content_hash, source.id);
  assert.deepEqual(proposalSeen.citations, [source.id]);
  for (const slot of ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"]) {
    assert.equal(typeof proposalSeen[slot], "string", `handler must author ${slot}`);
  }
  assert.ok(calls.some(({ sql }) => /result_tuple=\$2/i.test(sql)));
}

// A queued row that no longer matches the projected head is closed as stale, never executed.
{
  let claims = 0;
  let staleClosed = false;
  const client = {
    async query(sql) {
      if (/WITH next AS/i.test(sql)) {
        claims += 1;
        return claims === 1 ? { rows: [queue()], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (/stale_custody_projection|last_error=\$2/i.test(sql)) {
        staleClosed = true;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const result = await custodyExecutorRunOnce(client, "runtime.executor", "worker:test", 60, {
    project: async () => state({ current_tuple: "e".repeat(64) }),
  });
  assert.equal(result, null);
  assert.equal(staleClosed, true);
  assert.equal(claims, 2);
}

// Unknown activities are never guessed or mapped to the legacy adapter queue.
{
  let appendCalls = 0;
  const client = {
    async query(sql) {
      if (/WITH next AS/i.test(sql)) return { rows: [queue()], rowCount: 1 };
      if (/SET last_error=\$2/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  await assert.rejects(
    custodyExecutorRunOnce(client, "runtime.executor", "worker:test", 60, {
      project: async () => state({ activity: "human review" }),
      sourceByTuple: async () => source,
      loadType: async () => processType("human review"),
      appendProposal: async () => {
        appendCalls += 1;
        return source;
      },
    }),
    (error) => error instanceof CustodyExecutionError && error.code === "activity_not_registered",
  );
  assert.equal(appendCalls, 0);
}

// Dangerous custody activity reuses grant verification and does not append on rejection.
{
  const dangerousSource = await mintReceipt({
    who: "operator",
    did: "requested",
    this: "dangerous internal receipt",
    when: "2026-08-21T17:30:00.000Z",
    confirmed_by: "operator",
    if_ok: "continue",
    if_doubt: "review",
    if_not: "stop",
    status: "ok",
    grant_id: "f".repeat(64),
    envelope: {},
  });
  let grantCalls = 0;
  let appendCalls = 0;
  const client = {
    async query(sql) {
      if (/WITH next AS/i.test(sql)) return { rows: [queue()], rowCount: 1 };
      if (/SET last_error=\$2/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  await assert.rejects(
    custodyExecutorRunOnce(client, "runtime.executor", "worker:test", 60, {
      project: async () => state(),
      sourceByTuple: async () => dangerousSource,
      loadType: async () => processType("receipt", { danger_tier: "L4" }),
      verifyGrant: async (_client, grantId, params) => {
        grantCalls += 1;
        assert.equal(grantId, "f".repeat(64));
        assert.equal(params.processId, "auto-receipt.v1");
        assert.equal(params.effectiveAdapter, "receipt");
        return { ok: false, reason: "grant_unsigned" };
      },
      appendProposal: async () => {
        appendCalls += 1;
        return dangerousSource;
      },
    }),
    (error) => error instanceof CustodyExecutionError && error.code === "grant_unsigned",
  );
  assert.equal(grantCalls, 1);
  assert.equal(appendCalls, 0);
}

// Production runner drains custody first and reaches legacy runtime_queue only when none exists.
{
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
  const result = await executorRunOnce(client, "cron-test");
  assert.equal(result, null);
  assert.match(calls[0].sql, /runtime_custody_queue/i);
  assert.deepEqual(calls[0].params.slice(0, 2), ["runtime.executor", "cron-test"]);
  assert.match(calls[1].sql, /public\.runtime_queue/i);
}

console.log("custody executor: leases, exact tuple, safety, adapter ownership, and legacy fallback pinned");
