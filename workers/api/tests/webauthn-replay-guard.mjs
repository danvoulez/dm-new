import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/webauthn.ts", import.meta.url), "utf8");
const store = source.slice(source.indexOf("async function storeChallenge"), source.indexOf("async function consumeChallenge"));

assert.match(store, /INSERT OR IGNORE INTO webauthn_challenges/i);
assert.match(store, /AND used=0/i);
assert.equal(/SET\s+used\s*=\s*0/i.test(store), false, "used challenges must never be reset to unused");
assert.match(source, /challenge_already_consumed/);
assert.match(source, /Burn the ceremony before any cryptographic verification attempt/);

console.log("worker WebAuthn replay guard: ok");
