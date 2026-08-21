import assert from "node:assert/strict";
import { ProposalVerificationError, verifyProposal } from "../src/proposal-verifier.ts";

const KNOWN_HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

function tuple(overrides = {}) {
  return {
    who: "dan@example.com",
    did: "utterly_unknown_project_verb",
    this: "free form subject nobody taught the kernel",
    when: "2026-08-14T10:00:00.000Z",
    confirmed_by: "committee:purple",
    if_ok: "continue-somewhere-strange",
    if_doubt: "ask-the-moon",
    if_not: "stop-ish",
    status: "project-local-status",
    ...overrides,
  };
}

function client({
  hashes = [KNOWN_HASH, OTHER_HASH],
  processes = { "projection-build.v1": KNOWN_HASH },
} = {}) {
  return {
    async query(sql, params = []) {
      if (sql.includes("public.logline_acts")) {
        const requested = params[0] ?? [];
        return { rows: requested.filter((hash) => hashes.includes(hash)).map((content_hash) => ({ content_hash })) };
      }
      if (sql.includes("public.process_contracts")) {
        const processId = params[0];
        return Object.hasOwn(processes, processId)
          ? { rows: [{ process_id: processId, registered_hash: processes[processId] }] }
          : { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

// Free tuple principle: semantic weirdness is not kernel rejection.
const ugly = await verifyProposal(client(), {
  ...tuple(),
  arbitrary_aux: { anything: [1, 2, 3] },
}, { identity: "dan@example.com" });
assert.equal(ugly.ok, true);
assert.ok(ugly.checks.includes("tuple_shape"));
assert.ok(ugly.checks.includes("session_identity"));
assert.equal(ugly.process_id, null);

// Explicit existing references are objectively verifiable and bound to the chosen process type.
const cited = await verifyProposal(client(), {
  ...tuple(),
  citations: [KNOWN_HASH],
  process_id: "projection-build.v1",
  contract_hash: KNOWN_HASH,
}, { identity: "dan@example.com" });
assert.deepEqual(cited.referenced_hashes, [KNOWN_HASH]);
assert.ok(cited.checks.includes("referenced_hashes_exist"));
assert.ok(cited.checks.includes("process_type_exists"));
assert.ok(cited.checks.includes("contract_hash_current"));

await assert.rejects(
  () => verifyProposal(client(), tuple({ who: "mallory@example.com" }), { identity: "dan@example.com" }),
  (error) => error instanceof ProposalVerificationError && error.code === "who_identity_mismatch",
);

await assert.rejects(
  () => verifyProposal(client({ hashes: [] }), { ...tuple(), citations: [KNOWN_HASH] }),
  (error) => error instanceof ProposalVerificationError && error.code === "hash_not_found" && error.detail.missing[0] === KNOWN_HASH,
);

await assert.rejects(
  () => verifyProposal(client({ processes: {} }), { ...tuple(), process_id: "ghost-process.v1" }),
  (error) => error instanceof ProposalVerificationError && error.code === "process_type_not_found",
);

// An existing hash cannot be cited as the process contract if it is not the registered hash of that type.
await assert.rejects(
  () => verifyProposal(client(), {
    ...tuple(),
    process_id: "projection-build.v1",
    contract_hash: OTHER_HASH,
    citations: [OTHER_HASH],
  }),
  (error) => error instanceof ProposalVerificationError
    && error.code === "contract_hash_mismatch"
    && error.detail.expected === KNOWN_HASH
    && error.detail.observed === OTHER_HASH,
);

await assert.rejects(
  () => verifyProposal(client(), tuple({ when: "not-a-time" })),
  (error) => error instanceof ProposalVerificationError && error.code === "when_invalid",
);

const missing = tuple();
delete missing.if_doubt;
await assert.rejects(
  () => verifyProposal(client(), missing),
  (error) => error instanceof ProposalVerificationError && error.code === "slot_missing" && error.detail.slot === "if_doubt",
);

console.log("proposal verifier: objective checks only; semantic ugliness remains admissible");
