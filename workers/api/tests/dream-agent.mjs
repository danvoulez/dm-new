import assert from "node:assert/strict";
import { DREAM_TOOL_DEFINITIONS, runDreamTurn } from "../src/dream-agent.ts";

const HASH = "a".repeat(64);
const SLOT_NAMES = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];

function slots(overrides = {}) {
  return {
    who: "dan@example.com",
    did: "registered",
    this: "Q3 fechou",
    when: "2026-08-14T10:00:00.000Z",
    confirmed_by: "dan@example.com",
    if_ok: "close",
    if_doubt: "clarify",
    if_not: "close",
    status: "noted",
    ...overrides,
  };
}

const formalizeDefinition = DREAM_TOOL_DEFINITIONS.find((tool) => tool.name === "formalize_acts");
assert.ok(formalizeDefinition);
const actSchema = formalizeDefinition.parameters.properties.acts.items;
assert.deepEqual(actSchema.required, ["slots", "fields", "citations"]);
assert.deepEqual(Object.keys(actSchema.properties.slots.properties), SLOT_NAMES);
assert.deepEqual([...actSchema.properties.slots.required], SLOT_NAMES);
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
  assert.match(model.requests[0].messages[0].content, /LogLine inteira/i);
  assert.match(model.requests[0].messages[0].content, /backend não preenche/i);
  assert.match(model.requests[0].messages[0].content, /ator do acontecimento/i);
}

{
  const model = scripted([{ content: "Contexto recebido." }]);
  const h = harness(model);
  await runDreamTurn({
    message: "oi",
    conversation_id: "conv_context",
    trusted_context: { identity: "dan@example.com", now: "2026-08-14T10:00:00.000Z" },
  }, h.deps);
  const systems = model.requests[0].messages.filter((item) => item.role === "system");
  assert.equal(systems.length, 2);
  assert.match(systems[1].content, /session_identity=dan@example\.com/);
  assert.match(systems[1].content, /now=2026-08-14T10:00:00\.000Z/);
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
  const proposal = { slots: slots(), fields: {}, citations: [] };
  const model = scripted([
    { tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts: [proposal] } }] },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "registre que o Q3 fechou", conversation_id: "conv_0003" }, h.deps);
  assert.equal(turn.registrations.length, 1);
  assert.equal("process_id" in h.calls[0][1][0], false);
  assert.deepEqual(h.calls[0][1][0].slots, proposal.slots);
  assert.equal(turn.reply, "Registrado · Recibo 00000000 · Apenas registrado; nenhuma ativação foi solicitada.");
  assert.equal(model.requests.length, 1, "a persisted registration must not be reinterpreted by another model turn");
}

{
  const processAct = {
    process_id: "projection-build.v1",
    contract_hash: HASH,
    slots: slots({
      did: "request_projection",
      this: "Q3",
      if_ok: "projection-build.v1",
      if_doubt: "attention-raise.v1",
      if_not: "stop",
      status: "registered",
    }),
    fields: { projection_spec: "resumo do Q3" },
    citations: [HASH],
  };
  const model = scripted([
    { tool_calls: [{ id: "s1", name: "search_processes", arguments: { query: "criar resumo" } }] },
    { tool_calls: [{ id: "r1", name: "read_process_contract", arguments: { process_id: "projection-build.v1" } }] },
    { tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts: [processAct] } }] },
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
    slots: slots({ did: "request_projection", this: "Q3" }),
    fields: { projection_spec: "resumo do Q3" },
    citations: [HASH],
  };
  const model = scripted([
    { tool_calls: [{ id: "s1", name: "search_processes", arguments: { query: "projeção" } }] },
    { tool_calls: [{ id: "bad", name: "formalize_acts", arguments: { acts: [{ slots: slots(), fields: {}, citations: [] }] } }] },
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
  assert.equal(turn.registrations[0].activated, true);
  assert.deepEqual(model.requests[1].tool_choice, { type: "function", function: { name: "read_process_contract" } });
  assert.deepEqual(model.requests[3].tool_choice, { type: "function", function: { name: "formalize_acts" } });
}

{
  const model = scripted([
    { tool_calls: [{ id: "s1", name: "search_processes", arguments: { query: "projeção" } }] },
    { content: "Vou assumir os dados e criar uma projeção imaginária." },
  ]);
  const h = harness(model);
  await assert.rejects(
    () => runDreamTurn({ message: "crie uma projeção", conversation_id: "conv_required_tool" }, h.deps),
    (error) => error.code === "required_tool_not_called" && error.status === 502 && error.required_tool === "read_process_contract",
  );
  assert.equal(h.registered.length, 0);
}

{
  const acts = [
    { slots: slots({ this: "Q3 fechou" }), fields: {}, citations: [] },
    { slots: slots({ this: "Q4 abriu" }), fields: {}, citations: [] },
  ];
  const model = scripted([{ tool_calls: [{ id: "f1", name: "formalize_acts", arguments: { acts } }] }]);
  const h = harness(model);
  await runDreamTurn({ message: "registre que o Q3 fechou e o Q4 abriu", conversation_id: "conv_0005" }, h.deps);
  assert.equal(h.registered.length, 2);
}

console.log("worker dream agent: complete LLM-authored tuple + trusted context behavior ok");
