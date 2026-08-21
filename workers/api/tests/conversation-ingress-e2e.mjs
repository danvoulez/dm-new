import assert from "node:assert/strict";
import { runDreamTurn } from "../src/dream-agent.ts";
import { assembleAct } from "../src/process-tools.ts";
import { evaluate } from "../src/evaluator.ts";
import { mintReceipt } from "../src/receipt.ts";
import { SEED_CONTRACTS } from "../src/seed-contracts.ts";

const CONTRACT_HASH = "c".repeat(64);
const projectionSeed = SEED_CONTRACTS.find((item) => item.process_id === "projection-build.v1");
assert.ok(projectionSeed, "projection-build.v1 must exist");
const contract = { ...projectionSeed.contract, registered_hash: CONTRACT_HASH };
const catalog = new Map([[contract.process_id, contract]]);

function pureTuple(overrides = {}) {
  return {
    who: "dan",
    did: "registered",
    this: "Q3 fechou",
    when: "2026-08-14T10:00:00.000Z",
    confirmed_by: "dan",
    if_ok: "close",
    if_doubt: "clarify",
    if_not: "close",
    status: "noted",
    ...overrides,
  };
}

function processTuple(overrides = {}) {
  return pureTuple({
    did: "request_projection",
    this: "Q3",
    if_ok: "projection-build.v1",
    if_doubt: "attention-raise.v1",
    if_not: "stop",
    status: "registered",
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

function formalizeCall(acts, id = "formalize") {
  return { tool_calls: [{ id, name: "formalize_acts", arguments: { acts } }] };
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
      async searchProcesses(query) {
        calls.push(["search_processes", query]);
        return [{ process_id: contract.process_id, registered_hash: CONTRACT_HASH, citable: true }];
      },
      async readProcessContract(processId) {
        calls.push(["read_process_contract", processId]);
        return { process_id: contract.process_id, registered_hash: CONTRACT_HASH, citable: true, slot_rules: contract.slot_rules };
      },
      async formalizeActs(proposals) {
        calls.push(["formalize_acts", proposals]);
        const outcomes = [];
        for (const proposal of proposals) {
          const fields = assembleAct(proposal, proposal.process_id ? contract : undefined);
          const receipt = await mintReceipt(fields);
          const decision = evaluate(receipt, catalog);
          ledger.push({ receipt, decision });
          if (decision.activate) queue.push(receipt.id);
          outcomes.push({
            registered: true,
            id: receipt.id,
            fingerprint: receipt.id.slice(0, 8),
            activated: decision.activate,
            process_id: decision.process_id ?? null,
            queued: decision.activate,
          });
        }
        return outcomes;
      },
      async getCase() { return null; },
      async getPendencies() { return { count: 0, pendencies: [] }; },
    },
  };
}

// 1. Conversa comum: nenhuma ferramenta, formalização ou gravação.
{
  const model = scripted([{ content: "Bom dia." }]);
  const h = createHarness(model);
  const result = await runDreamTurn({ message: "bom dia", conversation_id: "conv_e2e_01" }, h.deps);
  assert.equal(result.reply, "Bom dia.");
  assert.equal(h.calls.length, 0);
  assert.equal(h.ledger.length, 0);
}

// 2. Registro simples: a tupla inteira vem do LLM, recebe hash e fica inert.
{
  const proposal = { slots: pureTuple(), fields: { free_project_note: "kept" }, citations: [] };
  const h = createHarness(scripted([formalizeCall([proposal])]));
  const result = await runDreamTurn({ message: "registre que Q3 fechou", conversation_id: "conv_e2e_02" }, h.deps);
  assert.equal(result.registrations.length, 1);
  assert.equal(h.ledger[0].decision.activation_state, "inert");
  assert.equal(h.ledger[0].receipt.process_id, undefined);
  assert.equal(h.ledger[0].receipt.free_project_note, "kept");
  assert.deepEqual(
    Object.fromEntries(Object.keys(proposal.slots).map((slot) => [slot, h.ledger[0].receipt[slot]])),
    proposal.slots,
  );
  assert.equal(h.queue.length, 0);
}

// 3. Processo correto: consulta, cita o contrato e só depois o runtime deriva consequência.
{
  const proposal = {
    process_id: contract.process_id,
    contract_hash: CONTRACT_HASH,
    slots: processTuple(),
    fields: { projection_spec: "resumo Q3" },
    citations: [CONTRACT_HASH],
  };
  const model = scripted([
    { tool_calls: [{ id: "search", name: "search_processes", arguments: { query: "projeção" } }] },
    { tool_calls: [{ id: "read", name: "read_process_contract", arguments: { process_id: contract.process_id } }] },
    formalizeCall([proposal]),
  ]);
  const h = createHarness(model);
  await runDreamTurn({ message: "crie uma projeção do Q3", conversation_id: "conv_e2e_03" }, h.deps);
  assert.deepEqual(h.calls.map(([name]) => name), ["search_processes", "read_process_contract", "formalize_acts"]);
  assert.deepEqual(h.ledger[0].receipt.citations, [CONTRACT_HASH]);
  assert.equal(h.ledger[0].decision.activation_state, "ativável");
  assert.equal(h.queue.length, 1);
}

// 4. Semântica incompatível não é corrigida: Act preservado, consequência não roteia.
{
  const proposal = {
    process_id: contract.process_id,
    contract_hash: CONTRACT_HASH,
    slots: processTuple({ did: "registered" }),
    fields: { projection_spec: "resumo Q3" },
    citations: [CONTRACT_HASH],
  };
  const h = createHarness(scripted([
    { tool_calls: [{ id: "read-4", name: "read_process_contract", arguments: { process_id: contract.process_id } }] },
    formalizeCall([proposal]),
  ]));
  await runDreamTurn({ message: "registre como projeção", conversation_id: "conv_e2e_04" }, h.deps);
  assert.match(h.ledger[0].receipt.id, /^[0-9a-f]{64}$/);
  assert.equal(h.ledger[0].receipt.did, "registered", "backend must not coerce the semantic field");
  assert.equal(h.ledger[0].decision.activation_state, "incompatible");
  assert.equal(h.queue.length, 0);
}

// 5. AUX ausente é consequência do contrato atual, não falha estrutural da LogLine.
{
  const proposal = {
    process_id: contract.process_id,
    contract_hash: CONTRACT_HASH,
    slots: processTuple(),
    fields: {},
    citations: [CONTRACT_HASH],
  };
  const h = createHarness(scripted([
    { tool_calls: [{ id: "read-5", name: "read_process_contract", arguments: { process_id: contract.process_id } }] },
    formalizeCall([proposal]),
  ]));
  await runDreamTurn({ message: "crie uma projeção", conversation_id: "conv_e2e_05" }, h.deps);
  assert.equal(h.ledger[0].decision.activation_state, "incompleto");
  assert.deepEqual(h.ledger[0].decision.missing_aux, ["projection_spec"]);
  assert.equal(h.queue.length, 0);
}

// 6. Dois fatos são dois Acts e dois hashes.
{
  const proposals = [
    { slots: pureTuple({ this: "Q3 fechou" }), fields: {}, citations: [] },
    { slots: pureTuple({ this: "Q4 abriu" }), fields: {}, citations: [] },
  ];
  const h = createHarness(scripted([formalizeCall(proposals)]));
  await runDreamTurn({ message: "registre os dois fatos", conversation_id: "conv_e2e_06" }, h.deps);
  assert.equal(h.ledger.length, 2);
  assert.equal(new Set(h.ledger.map(({ receipt }) => receipt.id)).size, 2);
}

// 7. Correção é um novo Act que cita o anterior; nunca reescreve o hash anterior.
{
  const prior = await mintReceipt(assembleAct({ slots: pureTuple({ this: "era Q3" }), fields: {}, citations: [] }));
  const correction = {
    slots: pureTuple({ this: "era Q4" }),
    fields: { corrects: prior.id },
    citations: [prior.id],
  };
  const h = createHarness(scripted([formalizeCall([correction])]));
  await runDreamTurn({ message: "corrija: era Q4", conversation_id: "conv_e2e_07" }, h.deps);
  assert.notEqual(h.ledger[0].receipt.id, prior.id);
  assert.equal(h.ledger[0].receipt.corrects, prior.id);
  assert.deepEqual(h.ledger[0].receipt.citations, [prior.id]);
}

console.log("conversation ingress e2e: 7 cases on complete LLM-authored tuples");
