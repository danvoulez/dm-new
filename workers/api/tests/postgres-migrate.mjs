import assert from "node:assert/strict";
import { migrateReceiptV1 } from "../src/postgres-migrate.ts";

const calls = [];
const client = {
  async query(sql) {
    calls.push(sql);
    return { rows: [], rowCount: 0 };
  },
};

await migrateReceiptV1(client);
assert.equal(calls.length, 1);
const sql = calls[0];

assert.match(sql, /drop constraint if exists runtime_queue_source_hash_fkey/i);
assert.match(sql, /drop constraint if exists process_contracts_registered_hash_fkey/i);
assert.match(sql, /primary key \(tuple_hash\)/i);
assert.match(sql, /logline_acts_content_hash_idx/i);
assert.match(sql, /logline\.receipt\.v0/i);
assert.match(sql, /logline\.receipt\.v1/i);
assert.match(sql, /- 'envelope'/i);
assert.match(sql, /hashes'->>'envelope_hash' = envelope_hash/i);

console.log("postgres receipt v1 migration: tuple occurrence PK + semantic content index pinned");
