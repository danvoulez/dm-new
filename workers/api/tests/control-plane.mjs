import assert from "node:assert/strict";
import { canGenericRegisterDid, RESERVED_REGISTER_DIDS } from "../src/control-plane.ts";

const mustBeServerOnly = [
  "authority",
  "authority-revoke",
  "authenticator-enroll",
  "authenticator-revoke",
  "authenticator-counter",
  "grant",
  "grant-revoke",
  "grant-signoff",
  "queued",
  "dispatching",
  "doubt",
  "not_dispatched",
  "adapter_doubted",
  "evidence_incomplete",
  "fechado",
  "llm.receipt",
];

assert.deepEqual([...RESERVED_REGISTER_DIDS], mustBeServerOnly);
for (const did of mustBeServerOnly) {
  assert.equal(canGenericRegisterDid(did), false, `${did} must be rejected by generic register`);
  assert.equal(canGenericRegisterDid(` ${did} `), false, `${did} must still be rejected with whitespace`);
}

for (const did of ["memory-register.v1", "purchase-approval.v1", "candidate", "custom.business.event"]) {
  assert.equal(canGenericRegisterDid(did), true, `${did} should remain available to business contracts`);
}

console.log("worker control-plane membrane: ok");
