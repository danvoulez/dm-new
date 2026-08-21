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
  assert.equal(appended.length, 4, "three bootstrap vocabulary Acts precede one type definition");
  assert.deepEqual(appended.slice(0, 3).map((act) => act.did), [
    "defined_vocabulary_term",
    "defined_vocabulary_term",
    "defined_vocabulary_term",
  ]);
  assert.deepEqual(appended.slice(0, 3).map((act) => act.definition.term), [
    "defined_vocabulary_term",
    "defined_process_type",
    "opened_process",
  ]);
  assert.equal(appended[3].did, "defined_process_type");
  assert.equal(appended[3].this, seed.process_id);
  assert.equal("process_id" in appended[3], false);
  assert.deepEqual(appended[3].definition, seed.contract);
  assert.deepEqual(appended[3].envelope, {});
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
  assert.equal(appendCalls, 0, "bootstrap/type import is idempotent when matching Acts already exist");
}

assert.equal(await ensureRegisteredContract({}, seed, ""), null);

console.log("worker contract registration: YAML emits bootstrap vocabulary + defined_process_type Acts");
