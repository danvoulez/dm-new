import assert from "node:assert/strict";
import {
  BOOTSTRAP_VOCABULARY,
  aboutSystem,
  loadLedgerProcessTypes,
  migrateLedgerRegistry,
  searchLedger,
} from "../src/ledger-registry.ts";

const TYPE_HASH = "a".repeat(64);
const TYPE_TUPLE = "b".repeat(64);
const VOCAB_HASH = "c".repeat(64);
const VOCAB_TUPLE = "d".repeat(64);
const definition = {
  process_id: "projection-build.v2",
  title: "Projection v2",
  status: "active",
  adapters: ["receipt"],
  slot_rules: {},
};
const vocabulary = {
  domain: "did",
  term: "defined_process_type",
  meaning: "defines a type",
  outcome: null,
  definition_hash: VOCAB_HASH,
  tuple_hash: VOCAB_TUPLE,
  status: "active",
  definition: { domain: "did", term: "defined_process_type", meaning: "defines a type" },
};

function registryClient() {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push([sql, params]);
      if (sql.includes("FROM public.current_process_types") && sql.includes("WHERE process_id ILIKE")) {
        return { rows: [{ process_id: definition.process_id, registered_hash: TYPE_HASH, status: "active", definition }] };
      }
      if (sql.includes("FROM public.current_process_types")) {
        return { rows: [{ process_id: definition.process_id, registered_hash: TYPE_HASH, tuple_hash: TYPE_TUPLE, status: "active", definition }] };
      }
      if (sql.includes("FROM public.current_vocabulary") && sql.includes("WHERE domain ILIKE")) {
        return { rows: [vocabulary] };
      }
      if (sql.includes("FROM public.current_vocabulary")) return { rows: [vocabulary] };
      if (sql.includes("FROM public.logline_acts") && sql.includes("ILIKE")) {
        return { rows: [{ content_hash: TYPE_HASH, tuple_hash: TYPE_TUPLE, who: "dan", did: "defined_process_type", this: definition.process_id, status: "active", act: { definition } }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

{
  const client = registryClient();
  const types = await loadLedgerProcessTypes(client);
  assert.equal(types.size, 1);
  assert.equal(types.get(definition.process_id).registered_hash, TYPE_HASH);
  assert.equal(types.get(definition.process_id).title, "Projection v2");
}

{
  const client = registryClient();
  const about = await aboutSystem(client);
  assert.deepEqual(about.tools, ["about", "search", "append"]);
  assert.deepEqual(about.grammar.slots, ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"]);
  assert.deepEqual(about.bootstrap_verbs, BOOTSTRAP_VOCABULARY.map((item) => item.term));
  assert.equal(about.process_types[0].registered_hash, TYPE_HASH);
  assert.equal(about.vocabulary[0].definition_hash, VOCAB_HASH);
}

{
  const client = registryClient();
  const found = await searchLedger(client, "projection", 10);
  assert.equal(found.acts.length, 1);
  assert.equal(found.process_types[0].process_id, definition.process_id);
  assert.equal(found.vocabulary[0].term, "defined_process_type");
}

{
  const queries = [];
  const client = { async query(sql) { queries.push(sql); return { rows: [] }; } };
  await migrateLedgerRegistry(client);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /create or replace view public\.current_process_types/i);
  assert.match(queries[0], /create or replace view public\.current_vocabulary/i);
  assert.match(queries[0], /newer\.supersedes = d\.registered_hash/i);
}

console.log("ledger registry: type/vocabulary projections + about/search are ledger-native");
