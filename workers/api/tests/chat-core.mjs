import assert from "node:assert/strict";
import { parsePlannerCall, riskFromTier, safeHumanReply, validateChatTurn, valueWasSupplied } from "../src/chat-core.ts";

assert.deepEqual(parsePlannerCall('{"tool_call":{"name":"get_pendencies","arguments":{"resolved_by":"user"}}}'), {
  name: "get_pendencies", arguments: { resolved_by: "user" },
});
assert.throws(() => parsePlannerCall('{"name":"drop_database","arguments":{}}'), /llm_tool_invalid/);
assert.equal(riskFromTier("L0"), "none");
assert.equal(riskFromTier("L3"), "approval");
assert.equal(riskFromTier("L5"), "irreversible");
assert.equal(valueWasSupplied("ana@example.com", "Eu sou ana@example.com e confirmo"), true);
assert.equal(valueWasSupplied("inventado@example.com", "Eu sou ana@example.com"), false);
assert.equal(safeHumanReply("process_id: memory-register.v1", { kind: "status", summary: "Está em andamento." }), "Está em andamento.");
assert.equal(safeHumanReply("Tudo certo por aqui."), "Tudo certo por aqui.");

const validTurn = validateChatTurn({
  reply: "Está pronto para confirmar.",
  conversation_id: "conversation_123",
  action: { kind: "confirm_register", summary: "Registrar memória", fields: { this: "nota" }, missing: [], risk: "none", register_body: { did: "register" } },
});
assert.equal(validTurn.action?.kind, "confirm_register");
assert.throws(() => validateChatTurn({ reply: "", conversation_id: "conversation_123" }), /chat_turn_reply_invalid/);
assert.throws(() => validateChatTurn({ reply: "ok", conversation_id: "conversation_123", action: { kind: "status", summary: "ok", case_hash: "deadbeef" } }), /chat_turn_action_invalid:status/);
assert.throws(() => validateChatTurn({ reply: "ok", conversation_id: "conversation_123", action: { kind: "clarify", question: "?", extra: true } }), /chat_turn_action_invalid:clarify/);

console.log("worker chat core: ok");

// F3 contract suite: 20 representative validated turn shapes spanning every action kind,
// missing-field clarification, risk levels, status cases, and reply leak fallback.
const H = "a".repeat(64);
const cases = [
  { reply: "Posso registrar isso.", conversation_id: "conv_0001", action: { kind: "confirm_register", summary: "Registrar memória", fields: { this: "nota" }, missing: [], risk: "none", register_body: { did: "register" } } },
  { reply: "Preciso saber quem confirma.", conversation_id: "conv_0002", action: { kind: "confirm_register", summary: "Registrar decisão", fields: { this: "decisão" }, missing: ["quem confirma"], risk: "approval", register_body: { did: "register" } } },
  { reply: "Esta ação exige confirmação forte.", conversation_id: "conv_0003", action: { kind: "confirm_register", summary: "Registrar ação irreversível", fields: { this: "ação" }, missing: [], risk: "irreversible", register_body: { did: "register" } } },
  { reply: "Vou propor esse novo tipo.", conversation_id: "conv_0004", action: { kind: "confirm_new_type", summary: "Criar tipo Compra", contract_draft: { process_id: "compra.v1" } } },
  { reply: "A proposta está pronta.", conversation_id: "conv_0005", action: { kind: "confirm_new_type", summary: "Criar tipo Relatório", contract_draft: { process_id: "relatorio.v1", title: "Relatório" } } },
  { reply: "A autorização está pronta para revisão.", conversation_id: "conv_0006", action: { kind: "confirm_grant", summary: "Autorizar worker", grant_draft: { granted_to: "worker" } } },
  { reply: "Posso criar essa autorização.", conversation_id: "conv_0007", action: { kind: "confirm_grant", summary: "Autorizar relatório", grant_draft: { network_policy: "restricted" } } },
  { reply: "Use sua passkey para assinar.", conversation_id: "conv_0008", action: { kind: "request_passkey", summary: "Assinar autorização", grant_id: H, sign_options: { challenge: "abc" } } },
  { reply: "Face ID pode concluir a assinatura.", conversation_id: "conv_0009", action: { kind: "request_passkey", summary: "Assinar autorização", grant_id: H, sign_options: { userVerification: "required" } } },
  { reply: "O processo está em andamento.", conversation_id: "conv_0010", action: { kind: "status", summary: "Em andamento", case_hash: H } },
  { reply: "Não há pendências.", conversation_id: "conv_0011", action: { kind: "status", summary: "Não há pendências" } },
  { reply: "Encontrei uma pendência.", conversation_id: "conv_0012", action: { kind: "status", summary: "Há 1 pendência" } },
  { reply: "Qual processo você quer consultar?", conversation_id: "conv_0013", action: { kind: "clarify", question: "Qual processo você quer consultar?" } },
  { reply: "Quem deve confirmar?", conversation_id: "conv_0014", action: { kind: "clarify", question: "Quem deve confirmar?" } },
  { reply: "Até quando essa autorização deve valer?", conversation_id: "conv_0015", action: { kind: "clarify", question: "Até quando essa autorização deve valer?" } },
  { reply: "Descreva o resultado que você precisa.", conversation_id: "conv_0016", action: { kind: "clarify", question: "Descreva o resultado que você precisa." } },
  { reply: "Esse tipo existe, mas ainda não executa.", conversation_id: "conv_0017", action: { kind: "clarify", question: "Quer registrar isso como memória?" } },
  { reply: "A ação ainda não existe neste sistema.", conversation_id: "conv_0018", action: { kind: "status", summary: "A ação ainda não existe neste sistema." } },
  { reply: "A autorização precisa ser assinada.", conversation_id: "conv_0019", action: { kind: "status", summary: "A autorização precisa ser assinada." } },
  { reply: "Encontrei um resumo reconstruível.", conversation_id: "conv_0020", action: { kind: "status", summary: "Encontrei um resumo reconstruível." } },
];
assert.equal(cases.length, 20);
for (const turn of cases) assert.equal(validateChatTurn(turn).conversation_id, turn.conversation_id);

for (const leak of [
  `process_id: memory-register.v1`,
  `danger_tier L5`,
  `readiness contract-only`,
  `grant_id ${H}`,
  `hash ${H}`,
  '```json {"ok":true} ```',
  '{"process":"memory"}',
]) {
  assert.equal(safeHumanReply(leak, { kind: "status", summary: "Resumo humano seguro." }), "Resumo humano seguro.");
}
