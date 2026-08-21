import assert from "node:assert/strict";
import {
  ProcessToolError,
  assembleAct,
  readProcessContract,
  searchProcesses,
} from "../src/process-tools.ts";

const HASH = "a".repeat(64);
const rules = {
  who: { meaning: "autoridade solicitante", source: "session", predicate: "who.authorized" },
  did: { meaning: "pedido de projeção", source: "llm", predicate: "did.allowed", values: ["request_projection"] },
  this: { meaning: "alvo canônico", source: "llm", predicate: "this.canonical" },
  when: { meaning: "instante do registro", source: "clock", predicate: "when.registered_at" },
  confirmed_by: { meaning: "autoridade que confirma", source: "session", predicate: "confirmed_by.authority" },
  if_ok: { meaning: "continuidade positiva", source: "contract", predicate: "if_ok.compatible", values: ["projection-build.v1"] },
  if_doubt: { meaning: "continuidade de dúvida", source: "contract", predicate: "if_doubt.compatible", values: ["attention-raise.v1"] },
  if_not: { meaning: "continuidade negativa", source: "contract", predicate: "if_not.compatible", values: ["stop"] },
  status: { meaning: "estado inicial", source: "contract", predicate: "status.initial", values: ["registered"] },
};
const contract = {
  process_id: "projection-build.v1",
  title: "Criar resumo",
  status: "active",
  registered_hash: HASH,
  required_slots: Object.keys(rules),
  slot_rules: rules,
  activation_rules_explicit: true,
  must_include: ["projection_spec"],
  optional_aux: ["parent_projection_hashes"],
  adapters: ["projection"],
  danger_tier: "L1",
  evidence_must_include: ["projection_hashes"],
};
const client = {
  async query() {
    return { rows: [{ process_id: contract.process_id, title: contract.title, status: contract.status, registered_hash: HASH, contract }], rowCount: 1 };
  },
};

function tuple(overrides = {}) {
  return {
    who: "dan@powerfarm.app",
    did: "request_projection",
    this: "Q3",
    when: "2026-08-14T05:00:00.000Z",
    confirmed_by: "dan@powerfarm.app",
    if_ok: "projection-build.v1",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "registered",
    ...overrides,
  };
}

const found = await searchProcesses(client, "resumo projeção");
assert.equal(found.length, 1);
assert.equal(found[0].process_id, "projection-build.v1");
assert.equal(found[0].registered_hash, HASH);

const foundFromNaturalRequest = await searchProcesses(
  client,
  "Crie uma projeção de teste sobre a aceitação pública da Dream com uma especificação resumida",
);
assert.equal(foundFromNaturalRequest.length, 1, "natural request terms must not hide the intended process");
assert.equal(foundFromNaturalRequest[0].process_id, "projection-build.v1");

const detail = await readProcessContract(client, "projection-build.v1");
assert.equal(detail.citable, true);
assert.equal(detail.purpose, "pedido de projeção");
assert.deepEqual(detail.required_aux, ["projection_spec"]);
assert.deepEqual(detail.consequence, { adapter: "projection", evidence_must_include: ["projection_hashes"] });
assert.equal(detail.slot_rules.did.source, "llm");

// The model owns all nine fields. Assembly preserves them byte-for-byte semantically.
const authored = tuple({
  who: "machine:lab-8gb",
  when: "2026-08-13T22:10:00.000Z",
  if_ok: "model-chosen-ok",
  if_doubt: "model-chosen-doubt",
  if_not: "model-chosen-not",
  status: "model-chosen-status",
});
const assembled = assembleAct({
  process_id: "projection-build.v1",
  contract_hash: HASH,
  slots: authored,
  fields: {
    projection_spec: "resumo do Q3",
    project_specific_freeform: { note: "AUX is not kernel law" },
  },
  citations: [HASH],
}, contract);
assert.deepEqual(Object.fromEntries(Object.keys(rules).map((slot) => [slot, assembled[slot]])), authored);
assert.equal(assembled.process_id, "projection-build.v1");
assert.equal(assembled.contract_hash, HASH);
assert.equal(assembled.projection_spec, "resumo do Q3");
assert.deepEqual(assembled.project_specific_freeform, { note: "AUX is not kernel law" });

// Old contract source rules are context only: they cannot reject/rewrite the tuple.
assert.equal(assembled.who, "machine:lab-8gb");
assert.equal(assembled.if_ok, "model-chosen-ok");
assert.equal(assembled.status, "model-chosen-status");

assert.throws(() => assembleAct({
  process_id: "projection-build.v1",
  contract_hash: HASH,
  slots: { ...tuple(), status: undefined },
  fields: {},
  citations: [HASH],
}, contract), (error) => error instanceof ProcessToolError && error.code === "slot_type");

assert.throws(() => assembleAct({
  process_id: "projection-build.v1",
  contract_hash: "b".repeat(64),
  slots: tuple(),
  fields: {},
  citations: ["b".repeat(64)],
}, contract), (error) => error instanceof ProcessToolError && error.code === "contract_hash_mismatch");

const pureTuple = tuple({
  did: "registered",
  this: "Q3 fechou",
  if_ok: "close",
  if_doubt: "clarify",
  if_not: "close",
  status: "noted",
});
const pure = assembleAct({ slots: pureTuple, fields: { arbitrary: true }, citations: [] });
assert.equal("process_id" in pure, false);
assert.deepEqual(Object.fromEntries(Object.keys(rules).map((slot) => [slot, pure[slot]])), pureTuple);
assert.equal(pure.arbitrary, true);

assert.throws(() => assembleAct({
  process_id: "projection-build.v1",
  contract_hash: HASH,
  slots: tuple(),
  fields: {},
  citations: [HASH],
}, { ...contract, registered_hash: null }), (error) => error instanceof ProcessToolError && error.code === "contract_not_citable");

console.log("worker process tools: complete tuple is LLM-owned; assembly is lossless");
