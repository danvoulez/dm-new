import assert from "node:assert/strict";
import { legacyReceiverSelect } from "../src/legacy-runtime.ts";

const calls = [];
const client = {
  async query(sql, params = []) {
    calls.push({ sql, params });
    return { rows: [], rowCount: 0 };
  },
};

const selected = await legacyReceiverSelect(client, "memory-register.v1", 20);
const ledgerQuery = calls.find(({ sql }) => sql.includes("FROM public.logline_acts"));

assert.deepEqual(selected, []);
assert.ok(ledgerQuery);
assert.match(ledgerQuery.sql, /act->>'process_id'=\$1/);
assert.match(ledgerQuery.sql, /coalesce\(act->'envelope'->>'process',''\)=''/i);
assert.match(ledgerQuery.sql, /did <> 'opened_process'/i);
assert.doesNotMatch(ledgerQuery.sql, /WHERE if_ok=/);
assert.deepEqual(ledgerQuery.params, ["memory-register.v1", 20]);

console.log("legacy receiver selection: compatibility-only and excludes custody processes");
