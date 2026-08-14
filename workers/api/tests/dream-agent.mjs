import assert from "node:assert/strict";
import { DREAM_TOOL_DEFINITIONS, runDreamTurn } from "../src/dream-agent.ts";

const HASH = "a".repeat(64);

const formalizeDefinition = DREAM_TOOL_DEFINITIONS.find((tool) => tool.name === "formalize_acts");
assert.ok(formalizeDefinition);
const actSchema = formalizeDefinition.parameters.properties.acts.items;
assert.deepEqual(actSchema.required, ["slots", "fields", "missing", "citations"]);
assert.ok(actSchema.properties.process_id);
assert.ok(actSchema.properties.contract_hash);
assert.ok(actSchema.properties.slots.properties.did);
assert.ok(actSchema.properties.slots.properties.this);
assert.deepEqual(Object.keys(actSchema.properties.slots.properties), ["did", "this"]);
assert.deepEqual(actSchema.properties.slots.required, ["did", "this"]);
assert.ok(actSchema.properties.fields);
assert.ok(actSchema.properties.citations);

function scripted(responses) {
  const requests = [];
  return {
    requests,
    async complete(request) {
      requests.push(request);
      const response = responses.shift();
      if (!response) throw new Error("unexpected model call");
      return response;
    },
  };
}

function harness(model) {
  const calls = [];
  const registered = [];
  return {
    calls,
    registered,
    deps: {
      model,
      async searchProcesses(query) { calls.push(["search_processes", query]); return [{ process_id: "projection-build.v1", registered_hash: HASH }]; },
      async readProcessContract(processId) { calls.push(["read_process_contract", processId]); return { process_id: processId, registered_hash: HASH, citable: true }; },
      async formalizeActs(acts) {
        calls.push(["formalize_acts", acts]);
        const outcomes = acts.map((act, index) => ({ registered: true, id: `${index}`.padStart(64, "0"), activated: Boolean(act.process_id) }));
        registered.push(...outcomes);
        return outcomes;
      },
      async getCase(hash) { calls.push(["get_case", hash]); return { hash, status: "doubted" }; },
      async getPendencies() { calls.push(["get_pendencies"]); return { count: 2, pendencies: [] }; },
    },
  };
}

{
  const model = scripted([{ content: "Bom dia! Como posso ajudar?" }]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "bom dia", conversation_id: "conv_0001" }, h.deps);
  assert.equal(turn.reply, "Bom dia! Como posso ajudar?");
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.registered, []);
  assert.equal(model.requests[0].messages.filter((item) => item.role === "system").length, 1);
  assert.doesNotMatch(model.requests[0].messages[0].content, /CATÁLOGO|GRANTS|MODELOS|VOCABULÁRIO/);
  assert.match(model.requests[0].messages[0].content, /nunca invente o resultado/i);
  assert.match(model.requests[0].messages[0].content, /nunca faça registro puro/i);
}

{
  const model = scripted([
    { tool_calls: [{ id: "p1", name: "get_pendencies", arguments: {} }] },
    { content: "Há duas pendências para revisar." },
  ]);
  const h = harness(model);
  await runDreamTurn({ message: "o que está parado?", conversation_id: "conv_0002" }, h.deps);
  assert.deepEqual(h.calls.map(([name]) => name), ["get_pendencies"]);
  assert.deepEqual(h.registered, []);
}

{
  const model = scripted([
    { tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts: [{ slots: { did: "registered", this: "Q3 fechou" }, fields: {}, missing: [], citations: [] }] } }] },
    { content: "Não foi possível registrar." },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "registre que o Q3 fechou", conversation_id: "conv_0003" }, h.deps);
  assert.equal(turn.registrations.length, 1);
  assert.equal("process_id" in h.calls[0][1][0], false);
  assert.equal(turn.reply, "Registrado · Recibo 00000000 · Apenas registrado; nenhuma ativação foi solicitada.");
  assert.equal(model.requests.length, 1, "a persisted registration must not be reinterpreted by another model turn");
}

{
  const model = scripted([
    { tool_calls: [{ id: "s1", name: "search_processes", arguments: { query: "criar resumo" } }] },
    { tool_calls: [{ id: "r1", name: "read_process_contract", arguments: { process_id: "projection-build.v1" } }] },
    { tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts: [{ process_id: "projection-build.v1", contract_hash: HASH, slots: { did: "request_projection", this: "Q3" }, fields: { projection_spec: "resumo do Q3" }, missing: [], citations: [HASH] }] } }] },
    { content: "O pedido de resumo foi registrado." },
  ]);
  const h = harness(model);
  await runDreamTurn({ message: "crie o resumo do Q3", conversation_id: "conv_0004" }, h.deps);
  assert.deepEqual(h.calls.map(([name]) => name), ["search_processes", "read_process_contract", "formalize_acts"]);
  assert.equal(h.registered.length, 1);
}

{
  const processAct = {
    process_id: "projection-build.v1",
    contract_hash: HASH,
    slots: { did: "request_projection", this: "Q3" },
    fields: { projection_spec: "resumo do Q3" },
    missing: [],
    citations: [HASH],
  };
  const model = scripted([
    { tool_calls: [{ id: "s1", name: "search_processes", arguments: { query: "projeção" } }] },
    { tool_calls: [{ id: "bad", name: "formalize_acts", arguments: { acts: [{ slots: { did: "registered", this: "Q3" }, fields: {}, missing: [], citations: [] }] } }] },
    { tool_calls: [{ id: "r1", name: "read_process_contract", arguments: { process_id: "projection-build.v1" } }] },
    { tool_calls: [{ id: "good", name: "formalize_acts", arguments: { acts: [processAct] } }] },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "crie uma projeção do Q3", conversation_id: "conv_0004_retry" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "search_processes", ok: true },
    { name: "formalize_acts", ok: false, code: "process_required_after_consultation" },
    { name: "read_process_contract", ok: true },
    { name: "formalize_acts", ok: true },
  ]);
  assert.deepEqual(h.calls.map(([name]) => name), ["search_processes", "read_process_contract", "formalize_acts"]);
  assert.equal(turn.registrations[0].activated, true);
}

{
  const acts = [
    { slots: { did: "registered", this: "Q3 fechou" }, fields: {}, citations: [] },
    { slots: { did: "registered", this: "Q4 abriu" }, fields: {}, citations: [] },
  ];
  const model = scripted([
    { tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts } }] },
    { content: "Registrei os dois fatos." },
  ]);
  const h = harness(model);
  await runDreamTurn({ message: "registre que o Q3 fechou e o Q4 abriu", conversation_id: "conv_0005" }, h.deps);
  assert.equal(h.registered.length, 2);
}

{
  const PRIOR = "b".repeat(64);
  const correction = { slots: { did: "registered", this: "era Q4" }, fields: { corrects: PRIOR }, citations: [PRIOR] };
  const model = scripted([
    { tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts: [correction] } }] },
    { content: "Registrei a correção sem apagar o anterior." },
  ]);
  const h = harness(model);
  await runDreamTurn({ message: "não, era Q4", conversation_id: "conv_0006" }, h.deps);
  assert.equal(h.registered.length, 1);
  assert.equal(h.calls[0][1][0].fields.corrects, PRIOR);
}

console.log("worker dream agent behavior: ok");
