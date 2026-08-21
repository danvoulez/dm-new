import assert from "node:assert/strict";
import { append, UniversalToolError } from "../src/universal-tools.ts";

function tuple(overrides = {}) {
  return {
    who: "dan@example.com",
    did: "registered",
    this: "Q3 closed",
    when: "2026-08-21T12:00:00.000Z",
    confirmed_by: "dan@example.com",
    if_ok: "close",
    if_doubt: "clarify",
    if_not: "close",
    status: "noted",
    envelope: {},
    ...overrides,
  };
}

function client() {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push([sql, params]);
      if (sql.includes("INSERT INTO public.logline_acts")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM public.current_process_types")) return { rows: [] };
      if (sql.includes("FROM public.process_contracts")) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

{
  const db = client();
  const result = await append(db, tuple({ free_aux: { kept: true } }), { identity: "dan@example.com" });
  assert.equal(result.verified, true);
  assert.equal(result.registered, true);
  assert.equal(result.activated, false);
  assert.match(result.content_hash, /^[0-9a-f]{64}$/);
  assert.match(result.tuple_hash, /^[0-9a-f]{64}$/);
  assert.match(result.envelope_hash, /^[0-9a-f]{64}$/);
  const insert = db.queries.find(([sql]) => sql.includes("INSERT INTO public.logline_acts"));
  const persisted = JSON.parse(insert[1][3]);
  assert.deepEqual(persisted.free_aux, { kept: true });
  assert.deepEqual(persisted.envelope, {});
}

for (const [label, proposal, code] of [
  ["missing slot", (() => { const value = tuple(); delete value.if_doubt; return value; })(), "slot_missing"],
  ["missing envelope", (() => { const value = tuple(); delete value.envelope; return value; })(), "envelope_required"],
  ["system hash", { ...tuple(), id: "a".repeat(64) }, "system_field_forbidden"],
  ["reserved control did", tuple({ did: "grant" }), "reserved_did"],
]) {
  await assert.rejects(
    () => append(client(), proposal, { identity: "dan@example.com" }),
    (error) => error instanceof UniversalToolError && error.code === code,
    label,
  );
}

{
  const db = client();
  const result = await append(db, tuple({
    did: "defined_process_type",
    this: "demo.v1",
    status: "active",
    definition: { process_id: "demo.v1", entry: "start", nodes: [] },
  }), { identity: "dan@example.com" });
  assert.equal(result.registered, true);
  const insert = db.queries.find(([sql]) => sql.includes("INSERT INTO public.logline_acts"));
  const persisted = JSON.parse(insert[1][3]);
  assert.equal(persisted.did, "defined_process_type");
  assert.equal(persisted.definition.process_id, "demo.v1");
}

console.log("universal tools: append is strict, lossless, verify-before-append");
