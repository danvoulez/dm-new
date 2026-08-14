import assert from "node:assert/strict";
import { ensureRegisteredContract } from "../src/contract-registration.ts";

const HASH = "a".repeat(64);
const seed = { process_id: "projection-build.v1", source_yml: "processes/projection-build.v1.yml", contract: { process_id: "projection-build.v1" } };

{
  const queries = [];
  const appended = [];
  const client = { async query(sql, params) { queries.push([sql, params]); return { rows: [] }; } };
  const result = await ensureRegisteredContract(client, seed, "dan@powerfarm.app", async (_client, fields) => {
    appended.push(fields);
    return { id: HASH };
  });
  assert.equal(result, HASH);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].did, "registered_process_contract");
  assert.equal("process_id" in appended[0], false);
  assert.deepEqual(appended[0].contract, seed.contract);
  assert.match(queries.at(-1)[0], /UPDATE public\.process_contracts SET registered_hash/);
}

{
  let appendCalls = 0;
  const client = {
    async query(sql) {
      if (sql.includes("SELECT content_hash")) return { rows: [{ content_hash: HASH }] };
      return { rows: [] };
    },
  };
  const result = await ensureRegisteredContract(client, seed, "dan@powerfarm.app", async () => { appendCalls += 1; return { id: "b".repeat(64) }; });
  assert.equal(result, HASH);
  assert.equal(appendCalls, 0);
}

assert.equal(await ensureRegisteredContract({}, seed, ""), null);

console.log("worker contract registration: ok");
