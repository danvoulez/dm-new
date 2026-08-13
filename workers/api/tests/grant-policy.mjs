import assert from "node:assert/strict";
import { validateGrantInput } from "../src/grant-policy.ts";

const valid = {
  process: "worker-run.v1",
  granted_by: "operator",
  granted_to: "worker",
  valid_until: "2026-08-20T12:00:00Z",
  timeout_seconds: 30,
  fs_scope: "/tmp/report",
  network_policy: "restricted",
};

assert.equal(validateGrantInput(valid), null, "adapter and acu_limit are optional defaults");
for (const field of ["valid_until", "timeout_seconds", "fs_scope", "network_policy"]) {
  const candidate = { ...valid };
  delete candidate[field];
  assert.equal(validateGrantInput(candidate), field, `${field} must fail by field name`);
}
assert.equal(validateGrantInput({ ...valid, timeout_seconds: 0 }), "timeout_seconds");
assert.equal(validateGrantInput({ ...valid, timeout_seconds: -1 }), "timeout_seconds");
assert.equal(validateGrantInput({ ...valid, network_policy: "internet-ish" }), "network_policy");
assert.equal(validateGrantInput({ ...valid, valid_until: "tomorrow maybe" }), "valid_until");
for (const policy of ["none", "restricted", "open"]) {
  assert.equal(validateGrantInput({ ...valid, network_policy: policy }), null);
}

console.log("worker grant safety policy: ok");
