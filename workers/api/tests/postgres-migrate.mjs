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
assert.equal(calls.length, 3);
const identitySql = calls[0];
const registrySql = calls[1];
const custodySql = calls[2];

assert.match(identitySql, /drop constraint if exists runtime_queue_source_hash_fkey/i);
assert.match(identitySql, /drop constraint if exists process_contracts_registered_hash_fkey/i);
assert.match(identitySql, /primary key \(tuple_hash\)/i);
assert.match(identitySql, /logline_acts_content_hash_idx/i);
assert.match(identitySql, /logline\.receipt\.v0/i);
assert.match(identitySql, /logline\.receipt\.v1/i);
assert.match(identitySql, /- 'envelope'/i);
assert.match(identitySql, /hashes'->>'envelope_hash' = envelope_hash/i);
assert.match(registrySql, /current_process_types/i);
assert.match(registrySql, /current_vocabulary/i);
assert.match(registrySql, /did = 'defined_process_type'/i);
assert.match(registrySql, /did = 'defined_vocabulary_term'/i);
assert.match(custodySql, /runtime_custody_queue/i);
assert.match(custodySql, /process_instance/i);
assert.match(custodySql, /source_tuple/i);
assert.match(custodySql, /responsible/i);
assert.match(custodySql, /lease_until/i);
assert.match(custodySql, /logline_acts_parent_tuple_idx/i);
assert.match(custodySql, /create unique index if not exists logline_acts_process_parent_unique/i);
assert.match(custodySql, /envelope'->>'process'.*envelope'->>'parent'/is);

console.log("postgres migration: receipt + registry + custody + atomic no-fork guard pinned");
