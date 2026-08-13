import assert from "node:assert/strict";
import { contentHashChallenge, fromBase64Url, signCountRegressed, toBase64Url } from "../src/webauthn-challenge.ts";

const grantId = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const expected = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
assert.equal(contentHashChallenge(grantId), expected);
assert.equal(Buffer.from(fromBase64Url(expected)).toString("hex"), grantId);
assert.equal(toBase64Url(fromBase64Url(expected)), expected);

for (const invalid of ["", "abc", "G".repeat(64), "0".repeat(63), "0".repeat(65)]) {
  assert.throws(() => contentHashChallenge(invalid), /content_hash_not_hex/);
}

console.log("worker WebAuthn grant challenge: ok");

assert.equal(signCountRegressed(5, 4), true);
assert.equal(signCountRegressed(5, 5), false);
assert.equal(signCountRegressed(0, 0), false);
assert.equal(signCountRegressed(0, 1), false);
assert.equal(signCountRegressed(-1, 0), true);
