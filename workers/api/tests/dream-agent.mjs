import assert from "node:assert/strict";
import { DREAM_TOOL_DEFINITIONS, runDreamTurn } from "../src/dream-agent.ts";

const HASH = "a".repeat(64);
const TYPE_HASH = "e".repeat(64);
const INSTANCE_HASH = "f".repeat(64);
const PARENT_HASH = "1".repeat(64);
const SLOT_NAMES = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];

function act(overrides = {}) {
  return {
    who: "dan@example.com",
    did: "registered",
    this: "Q3 fechou",
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

assert.deepEqual(DREAM_TOOL_DEFINITIONS.map((tool) => tool.name), ["about", "search", "append"]);
const appendDefinition = DREAM_TOOL_DEFINITIONS.find((tool) => tool.name === "append");
assert.ok(appendDefinition);
const actSchema = appendDefinition.parameters.properties.act;
assert.deepEqual(actSchema.required, [...SLOT_NAMES, "envelope"]);
for (const slot of SLOT_NAMES) assert.ok(actSchema.properties[slot]);
assert.ok(actSchema.properties.envelope);
assert.ok(actSchema.properties.process_type, "opening process type hash must be visible to Dream");
assert.match(actSchema.properties.envelope.description, /process=.*parent=/i);

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
      async about() {
        calls.push(["about"]);
        return { grammar: { slots: SLOT_NAMES }, tools: ["about", "search", "append"] };
      },
      async search(query, limit) {
        calls.push(["search", query, limit]);
        if (query === INSTANCE_HASH) {
          return {
            query,
            acts: [],
            process_types: [],
            vocabulary: [],
            process_instance: {
              process_instance: INSTANCE_HASH,
              process_type: TYPE_HASH,
              process_id: "custody-review.v1",
              current_tuple: PARENT_HASH,
              current_node: "intake",
              responsible: "actor:clerk",
              activity: "receive and classify",
              status: "open",
            },
            custody: {
              process_instance: INSTANCE_HASH,
              source_tuple: PARENT_HASH,
              responsible: "actor:clerk",
              node: "intake",
              status: "queued",
            },
          };
        }
        return {
          process_types: [
            { process_id: "projection-build.v1", registered_hash: HASH, definition: { title: "Projection" } },
            { process_id: "custody-review.v1", registered_hash: TYPE_HASH, definition: { title: "Custody review" } },
          ],
          acts: [],
          vocabulary: [],
        };
      },
      async append(value) {
        calls.push(["append", value]);
        const id = `${registered.length}`.padStart(64, "0");
        const isOpening = value.did === "opened_process";
        const isDispatch = Boolean(value.envelope?.process);
        const processBound = Boolean(value.process_id) || isOpening || isDispatch;
        const result = {
          registered: true,
          id,
          content_hash: id,
          tuple_hash: "b".repeat(64),
          envelope_hash: "c".repeat(64),
          fingerprint: id.slice(0, 8),
          activated: processBound,
          process_id: isOpening || isDispatch ? "custody-review.v1" : value.process_id ?? null,
          process_instance: isOpening ? id : isDispatch ? value.envelope.process : null,
          queued: processBound,
        };
        registered.push(result);
        return result;
      },
    },
  };
}

{
  const model = scripted([{ content: "Bom dia! Como posso ajudar?" }]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "bom dia", conversation_id: "conv_0001" }, h.deps);
  assert.equal(turn.reply, "Bom dia! Como posso ajudar?");
  assert.deepEqual(h.calls, []);
  assert.equal(model.requests[0].messages.filter((item) => item.role === "system").length, 1);
  assert.match(model.requests[0].messages[0].content, /about, search e append/i);
  assert.match(model.requests[0].messages[0].content, /opened_process/i);
  assert.match(model.requests[0].messages[0].content, /current_tuple/i);
  assert.match(model.requests[0].messages[0].content, /backend não preenche/i);
}

{
  const model = scripted([{ content: "Contexto recebido." }]);
  const h = harness(model);
  await runDreamTurn({
    message: "oi",
    conversation_id: "conv_context",
    trusted_context: { identity: "dan@example.com", now: "2026-08-21T12:00:00.000Z" },
  }, h.deps);
  const systems = model.requests[0].messages.filter((item) => item.role === "system");
  assert.equal(systems.length, 2);
  assert.match(systems[1].content, /authenticated_identity/);
  assert.match(systems[1].content, /dan@example\.com/);
}

{
  const model = scripted([
    { tool_calls: [{ id: "a1", name: "about", arguments: {} }] },
    { content: "A máquina usa nove campos, AUX e envelope." },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "como funciona?", conversation_id: "conv_about" }, h.deps);
  assert.deepEqual(h.calls.map(([name]) => name), ["about"]);
  assert.match(turn.reply, /nove campos/i);
}

{
  const proposal = act();
  const model = scripted([{ tool_calls: [{ id: "p1", name: "append", arguments: { act: proposal } }] }]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "registre que o Q3 fechou", conversation_id: "conv_append" }, h.deps);
  assert.equal(turn.registrations.length, 1);
  assert.deepEqual(h.calls[0], ["append", proposal]);
  assert.equal(turn.reply, "Registrado · Recibo 00000000 · Apenas registrado; nenhuma ativação foi solicitada.");
  assert.equal(model.requests.length, 1, "persisted append must not be reinterpreted by another model turn");
}

{
  const bad = { ...act() };
  delete bad.envelope;
  const model = scripted([
    { tool_calls: [{ id: "bad", name: "append", arguments: { act: bad } }] },
    { tool_calls: [{ id: "good", name: "append", arguments: { act: act() } }] },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "registre o fato", conversation_id: "conv_retry" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "append", ok: false, code: "envelope_required" },
    { name: "append", ok: true },
  ]);
  assert.equal(h.registered.length, 1);
}

// Phase 2 compatibility: unmigrated process type still uses process_id/contract_hash.
{
  const processAct = act({
    did: "request_projection",
    this: "Q3",
    if_ok: "projection-build.v1",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "registered",
    process_id: "projection-build.v1",
    contract_hash: HASH,
    citations: [HASH],
    projection_spec: "resumo do Q3",
    envelope: { type: HASH, channel: "chat" },
  });
  const model = scripted([
    { tool_calls: [{ id: "bad", name: "append", arguments: { act: processAct } }] },
    { tool_calls: [{ id: "s1", name: "search", arguments: { query: "projeção" } }] },
    { tool_calls: [{ id: "good", name: "append", arguments: { act: processAct } }] },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "crie uma projeção do Q3", conversation_id: "conv_process" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "append", ok: false, code: "search_required_for_process" },
    { name: "search", ok: true },
    { name: "append", ok: true },
  ]);
  assert.deepEqual(h.calls.map(([name]) => name), ["search", "append"]);
  assert.equal(turn.registrations[0].activated, true);
}

{
  const wrongHash = "d".repeat(64);
  const processAct = act({
    process_id: "projection-build.v1",
    contract_hash: wrongHash,
    citations: [wrongHash],
  });
  const model = scripted([
    { tool_calls: [{ id: "s1", name: "search", arguments: { query: "projeção" } }] },
    { tool_calls: [{ id: "bad", name: "append", arguments: { act: processAct } }] },
    { content: "Não posso citar um tipo que a busca não comprovou." },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "crie uma projeção", conversation_id: "conv_bad_hash" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "search", ok: true },
    { name: "append", ok: false, code: "process_type_not_consulted" },
  ]);
  assert.equal(h.registered.length, 0);
  assert.match(turn.reply, /não posso/i);
}

// Phase 3 opening: type hash must have been observed through search; envelope stays empty.
{
  const opening = act({
    did: "opened_process",
    this: "case:42",
    status: "opened",
    process_type: TYPE_HASH,
    envelope: {},
  });
  const model = scripted([
    { tool_calls: [{ id: "bad-open", name: "append", arguments: { act: opening } }] },
    { tool_calls: [{ id: "search-type", name: "search", arguments: { query: "custody review" } }] },
    { tool_calls: [{ id: "open", name: "append", arguments: { act: opening } }] },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "abra uma revisão do caso 42", conversation_id: "conv_open_process" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "append", ok: false, code: "search_required_for_process" },
    { name: "search", ok: true },
    { name: "append", ok: true },
  ]);
  assert.equal(h.calls.at(-1)[1].did, "opened_process");
  assert.equal(h.calls.at(-1)[1].process_type, TYPE_HASH);
  assert.deepEqual(h.calls.at(-1)[1].envelope, {});
  assert.equal(turn.registrations[0].process_instance, turn.registrations[0].id);
  assert.match(turn.reply, /em custódia/i);
}

// Phase 3 dispatch: exact instance search must expose both instance hash and current parent tuple.
{
  const dispatch = act({
    who: "actor:clerk",
    did: "dispatched",
    this: "case:42 classified",
    confirmed_by: "actor:clerk",
    status: "ok",
    envelope: { process: INSTANCE_HASH, parent: PARENT_HASH },
  });
  const model = scripted([
    { tool_calls: [{ id: "search-instance", name: "search", arguments: { query: INSTANCE_HASH } }] },
    { tool_calls: [{ id: "dispatch", name: "append", arguments: { act: dispatch } }] },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "classificação concluída", conversation_id: "conv_dispatch" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "search", ok: true },
    { name: "append", ok: true },
  ]);
  assert.deepEqual(h.calls.at(-1)[1].envelope, { process: INSTANCE_HASH, parent: PARENT_HASH });
  assert.equal(turn.registrations[0].process_instance, INSTANCE_HASH);
}

{
  const staleParent = "2".repeat(64);
  const dispatch = act({
    who: "actor:clerk",
    did: "dispatched",
    status: "ok",
    envelope: { process: INSTANCE_HASH, parent: staleParent },
  });
  const model = scripted([
    { tool_calls: [{ id: "search-instance", name: "search", arguments: { query: INSTANCE_HASH } }] },
    { tool_calls: [{ id: "bad-dispatch", name: "append", arguments: { act: dispatch } }] },
    { content: "A busca não confirmou esse parent atual." },
  ]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "avance o processo", conversation_id: "conv_stale_dispatch" }, h.deps);
  assert.deepEqual(turn.tool_trace, [
    { name: "search", ok: true },
    { name: "append", ok: false, code: "process_context_not_consulted" },
  ]);
  assert.equal(h.registered.length, 0);
}

{
  const model = scripted([{ tool_calls: [
    { id: "one", name: "append", arguments: { act: act({ this: "Q3 fechou" }) } },
    { id: "two", name: "append", arguments: { act: act({ this: "Q4 abriu" }) } },
  ] }]);
  const h = harness(model);
  const turn = await runDreamTurn({ message: "registre os dois fatos", conversation_id: "conv_multi" }, h.deps);
  assert.equal(h.registered.length, 2);
  assert.equal(turn.registrations.length, 2);
}

console.log("worker dream agent: three-tool membrane + opening/instance custody grounding ok");
