import assert from "node:assert/strict";
import fs from "node:fs";

const dir = new URL("../migrations/", import.meta.url);
const names = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(names, [
  "0001_projections.sql",
  "0002_computed_at_idx.sql",
  "0003_webauthn_challenges.sql",
  "0004_chat_turns.sql",
  "0005_process_type_proposals.sql",
]);
const proposal = fs.readFileSync(new URL("../migrations/0005_process_type_proposals.sql", import.meta.url), "utf8");
assert.match(proposal, /CREATE TABLE IF NOT EXISTS process_type_proposals/i);
assert.match(proposal, /hash TEXT NOT NULL/i);

const index = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const route = index.slice(index.indexOf('app.post("/api/process-types"'), index.indexOf('app.get("/api/grants"'));
assert.doesNotMatch(route, /CREATE TABLE/i);
assert.match(route, /code: "not_migrated"/);
console.log("worker migrations: ok");
