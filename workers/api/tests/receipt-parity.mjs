import assert from "node:assert/strict";
import { canonicalJson, mintReceipt } from "../src/receipt.ts";

const receipt = await mintReceipt({
  who: "tester",
  did: "registered",
  this: "thing",
  when: "2026-06-22T00:00:00Z",
  confirmed_by: "test",
  if_ok: "next",
  if_doubt: "doubt",
  if_not: "stop",
  status: "registered",
});

assert.equal(receipt.id, "0881e59abc7a87c0b86474158af2fe208114263f67189d118294552d1f5a02e0");
assert.equal(receipt.hashes.tuple_hash, "32b2dd828e50b78eaca6e29dd0622f9074218aa3493eb6c121475fe212eda16b");
assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
assert.equal(canonicalJson({ "😀": 1, "￿": 2 }), '{"😀":1,"￿":2}');
assert.equal(canonicalJson(-0), "0");
assert.equal(canonicalJson(333333333.33333329), "333333333.3333333");
assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY));
assert.throws(() => canonicalJson(9007199254740992));

console.log("worker receipt parity: ok");
