import assert from "node:assert/strict";
import { receiverSelect } from "../src/runtime.ts";

const calls = [];
const client = {
  async query(sql, params = []) {
    calls.push({ sql, params });
    return { rows: [], rowCount: 0 };
  },
};

const selected = await receiverSelect(client, "memory-register.v1", 20);
const ledgerQuery = calls.find(({ sql }) => sql.includes("FROM public.logline_acts"));

assert.deepEqual(selected, []);
assert.ok(ledgerQuery);
assert.match(ledgerQuery.sql, /act->>'process_id'=\$1/);
assert.doesNotMatch(ledgerQuery.sql, /WHERE if_ok=/);
assert.deepEqual(ledgerQuery.params, ["memory-register.v1", 20]);

console.log("worker receiver selection: ok");
