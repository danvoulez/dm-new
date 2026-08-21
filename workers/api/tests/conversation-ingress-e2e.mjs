import assert from "node:assert/strict";
import { runDreamTurn } from "../src/dream-agent.ts";
import { evaluate } from "../src/evaluator.ts";
import { mintReceipt } from "../src/receipt.ts";
import { SEED_CONTRACTS } from "../src/seed-contracts.ts";

const CONTRACT_HASH = "c".repeat(64);
const projectionSeed = SEED_CONTRACTS.find((item) => item.process_id === "projection-build.v1");
assert.ok(projectionSeed, "projection-build.v1 must exist");
const contract = { ...projectionSeed.contract, registered_hash: CONTRACT_HASH };
const catalog = new Map([[contract.process_id, contract]]);

function pureAct(overrides = {}) {
  return {
    who: "dan",
    did: "registered",
    this: "Q3 fechou",
    when: "2026-08-21T12:00:00.000Z",
    confirmed_by: "dan",
    if_ok: "close",
    if_doubt: "clarify",
    if_not: "close",
    status: "noted",
    envelope: {},
    ...overrides,
  };
}

function processAct(overrides = {}) {
  return pureAct({
    did: "request_projection",
    this: "Q3",
    if_ok: "projection-build.v1",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "registered",
    process_id: contract.process_id,
    contract_hash: CONTRACT_HASH,
    citations: [CONTRACT_HASH],
    envelope: { type: CONTRACT_HASH, channel: "chat" },
    ...overrides,
  });
}

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

function appendCall(value, id = "append") {
  return { tool_calls: [{ id, name: "append", arguments: { act: value } }] };
}

function searchCall(query = "projeção") {
  return { tool_calls: [{ id: "search", name: "search", arguments: { query } }] };
}

function createHarness(model) {
  const ledger = [];
  const queue = [];
  const calls = [];
  return {
    ledger,
    queue,
    calls,
    deps: {
      model,
      async about() {
        calls.push(["about"]);
        return { tools: ["about", "search", "append"] };
      },
      async search(query) {
        calls.push(["search", query]);
        return { process_types: [{ process_id: contract.process_id, registered_hash: CONTRACT_HASH, definition: contract }] };
      },
      async append(fields) {
        calls.push(["append", fields]);
        const receipt = await mintReceipt(fields);
        const decision = evaluate(receipt, catalog);
        ledger.push({ receipt, decision });
        if (decision.activate) queue.push(receipt.hashes.tuple_hash);
        return {
          registered: true,
          id: receipt.id,
          content_hash: receipt.hashes.content_hash,
          tuple_hash: receipt.hashes.tuple_hash,
          envelope_hash: receipt.hashes.envelope_hash,
          fingerprint: receipt.id.slice(0, 8),
          activated: decision.activate,
          process_id: decision.process_id ?? null,
          queued: decision.activate,
        };
      },
    },
  };
}

// 1. Conversa comum: nenhuma ferramenta ou gravação.
{
  const h = createHarness(scripted([{ content: "Bom dia." }]));
  const result = await runDreamTurn({ message: "bom dia", conversation_id: "conv_e2e_01" }, h.deps);
  assert.equal(result.reply, "Bom dia.");
  assert.equal(h.calls.length, 0);
  assert.equal(h.ledger.length, 0);
}

// 2. Registro simples: 9 + AUX + envelope vêm do LLM e ficam inertes.
{
  const proposal = pureAct({ free_project_note: "kept" });
  const h = createHarness(scripted([appendCall(proposal)]));
  const result = await runDreamTurn({ message: "registre que Q3 fechou", conversation_id: "conv_e2e_02" }, h.deps);
  assert.equal(result.registrations.length, 1);
  assert.equal(h.ledger[0].decision.activation_state, "inert");
  assert.equal(h.ledger[0].receipt.process_id, undefined);
  assert.equal(h.ledger[0].receipt.free_project_note, "kept");
  assert.deepEqual(h.ledger[0].receipt.envelope, {});
  assert.equal(h.ledger[0].receipt.receipt_version, "logline.receipt.v1");
  assert.equal(h.queue.length, 0);
}

// 3. Processo correto: search revela o hash do tipo; append cita exatamente esse hash.
{
  const proposal = processAct({ projection_spec: "resumo Q3" });
  const h = createHarness(scripted([searchCall(), appendCall(proposal)]));
  await runDreamTurn({ message: "crie uma projeção do Q3", conversation_id: "conv_e2e_03" }, h.deps);
  assert.deepEqual(h.calls.map(([name]) => name), ["search", "append"]);
  assert.deepEqual(h.ledger[0].receipt.citations, [CONTRACT_HASH]);
  assert.deepEqual(h.ledger[0].receipt.envelope, proposal.envelope);
  assert.equal(h.ledger[0].decision.activation_state, "ativável");
  assert.equal(h.queue.length, 1);
}

// 4. Semântica incompatível não é corrigida: Act preservado, consequência não roteia.
{
  const proposal = processAct({ did: "registered", projection_spec: "resumo Q3" });
  const h = createHarness(scripted([searchCall(), appendCall(proposal)]));
  await runDreamTurn({ message: "registre como projeção", conversation_id: "conv_e2e_04" }, h.deps);
  assert.match(h.ledger[0].receipt.id, /^[0-9a-f]{64}$/);
  assert.equal(h.ledger[0].receipt.did, "registered", "backend must not coerce semantic fields");
  assert.equal(h.ledger[0].decision.activation_state, "incompatible");
  assert.equal(h.queue.length, 0);
}

// 5. AUX ausente é consequência do tipo atual, não falha estrutural da LogLine.
{
  const proposal = processAct();
  const h = createHarness(scripted([searchCall(), appendCall(proposal)]));
  await runDreamTurn({ message: "crie uma projeção", conversation_id: "conv_e2e_05" }, h.deps);
  assert.equal(h.ledger[0].decision.activation_state, "incompleto");
  assert.deepEqual(h.ledger[0].decision.missing_aux, ["projection_spec"]);
  assert.equal(h.queue.length, 0);
}

// 6. Dois fatos são dois Acts e dois hashes.
{
  const a = pureAct({ this: "Q3 fechou" });
  const b = pureAct({ this: "Q4 abriu" });
  const h = createHarness(scripted([{ tool_calls: [
    { id: "a", name: "append", arguments: { act: a } },
    { id: "b", name: "append", arguments: { act: b } },
  ] }]));
  await runDreamTurn({ message: "registre os dois fatos", conversation_id: "conv_e2e_06" }, h.deps);
  assert.equal(h.ledger.length, 2);
  assert.equal(new Set(h.ledger.map(({ receipt }) => receipt.id)).size, 2);
}

// 7. Correção é novo Act que cita o anterior; nunca reescreve o hash anterior.
{
  const prior = await mintReceipt(pureAct({ this: "era Q3" }));
  const correction = pureAct({ this: "era Q4", corrects: prior.id, citations: [prior.id] });
  const h = createHarness(scripted([appendCall(correction)]));
  await runDreamTurn({ message: "corrija: era Q4", conversation_id: "conv_e2e_07" }, h.deps);
  assert.notEqual(h.ledger[0].receipt.id, prior.id);
  assert.equal(h.ledger[0].receipt.corrects, prior.id);
  assert.deepEqual(h.ledger[0].receipt.citations, [prior.id]);
}

console.log("conversation ingress e2e: 7 cases through canonical about/search/append");
