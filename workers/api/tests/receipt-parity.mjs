import assert from "node:assert/strict";
import { canonicalJson, mintReceipt, mintReceiptV0, sha256Hex } from "../src/receipt.ts";

const fields = {
  who: "tester",
  did: "registered",
  this: "thing",
  when: "2026-06-22T00:00:00Z",
  confirmed_by: "test",
  if_ok: "next",
  if_doubt: "doubt",
  if_not: "stop",
  status: "registered",
};

const receipt = await mintReceipt({ ...fields, envelope: {} });
assert.equal(receipt.receipt_version, "logline.receipt.v1");
assert.equal(receipt.id, receipt.hashes.content_hash);
assert.deepEqual(receipt.envelope, {});
assert.match(receipt.hashes.content_hash, /^[0-9a-f]{64}$/);
assert.match(receipt.hashes.envelope_hash, /^[0-9a-f]{64}$/);
assert.match(receipt.hashes.tuple_hash, /^[0-9a-f]{64}$/);
assert.equal(receipt.hashes.envelope_hash, await sha256Hex("{}"));
assert.equal(receipt.hashes.tuple_hash, await sha256Hex(`${receipt.hashes.content_hash}${receipt.hashes.envelope_hash}`));

// Envelope is contextual identity, never content identity.
const routed = await mintReceipt({
  ...fields,
  envelope: { process: "a".repeat(64), parent: "b".repeat(64), channel: "chat" },
});
assert.equal(routed.hashes.content_hash, receipt.hashes.content_hash);
assert.notEqual(routed.hashes.envelope_hash, receipt.hashes.envelope_hash);
assert.notEqual(routed.hashes.tuple_hash, receipt.hashes.tuple_hash);

// AUX belongs to content identity.
const withAux = await mintReceipt({ ...fields, note: "aux changes content", envelope: {} });
assert.notEqual(withAux.hashes.content_hash, receipt.hashes.content_hash);
assert.equal(withAux.hashes.envelope_hash, receipt.hashes.envelope_hash);
assert.notEqual(withAux.hashes.tuple_hash, receipt.hashes.tuple_hash);

// Historical v0 parity remains exact.
const legacy = await mintReceiptV0(fields);
assert.equal(legacy.id, "0881e59abc7a87c0b86474158af2fe208114263f67189d118294552d1f5a02e0");
assert.equal(legacy.hashes.tuple_hash, "32b2dd828e50b78eaca6e29dd0622f9074218aa3493eb6c121475fe212eda16b");
assert.equal(legacy.receipt_version, "logline.receipt.v0");

assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
assert.equal(canonicalJson({ "😀": 1, "￿": 2 }), '{"😀":1,"￿":2}');
assert.equal(canonicalJson(-0), "0");
assert.equal(canonicalJson(333333333.33333329), "333333333.3333333");
assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY));
assert.throws(() => canonicalJson(9007199254740992));

console.log("worker receipt parity: v1 identity split + v0 compatibility ok");
