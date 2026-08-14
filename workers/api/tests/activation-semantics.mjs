import assert from "node:assert/strict";
import { evaluate } from "../src/evaluator.ts";

const slots = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];
const slotRules = {
  who: { meaning: "autoridade solicitante", source: "session", predicate: "who.authorized" },
  did: { meaning: "ato admitido", source: "llm", predicate: "did.allowed", values: ["request_projection"] },
  this: { meaning: "alvo canônico", source: "llm", predicate: "this.canonical" },
  when: { meaning: "instante de registro", source: "clock", predicate: "when.registered_at" },
  confirmed_by: { meaning: "confirmação", source: "session", predicate: "confirmed_by.authority" },
  if_ok: { meaning: "continuidade positiva", source: "contract", predicate: "if_ok.compatible", values: ["continue"] },
  if_doubt: { meaning: "continuidade de dúvida", source: "contract", predicate: "if_doubt.compatible", values: ["attention"] },
  if_not: { meaning: "continuidade negativa", source: "contract", predicate: "if_not.compatible", values: ["stop"] },
  status: { meaning: "estado inicial", source: "contract", predicate: "status.initial", values: ["registered"] },
};
const contract = (changes = {}) => ({
  process_id: "projection-build.v1",
  status: "active",
  required_slots: slots,
  slot_rules: slotRules,
  activation_rules_explicit: true,
  must_include: ["projection_spec"],
  allowed_who: ["dan"],
  adapters: ["receipt"],
  danger_tier: "L1",
  ...changes,
});
const act = (changes = {}) => ({
  process_id: "projection-build.v1",
  who: "dan",
  did: "request_projection",
  this: "Q3",
  when: "2026-08-14T04:00:00Z",
  confirmed_by: "dan",
  if_ok: "continue",
  if_doubt: "attention",
  if_not: "stop",
  status: "registered",
  projection_spec: "resumo do Q3",
  ...changes,
});
const catalog = (value = contract()) => new Map([[value.process_id, value]]);

{
  const decision = evaluate(act({ process_id: undefined, if_ok: "projection-build.v1" }), catalog());
  assert.equal(decision.registration_state, "registered");
  assert.equal(decision.activation_state, "inert");
  assert.equal(decision.matched, false);
  assert.equal(decision.reason, "no_process_requested");
}
{
  const decision = evaluate(act({ process_id: "missing.v1" }), catalog());
  assert.equal(decision.activation_state, "inert");
  assert.equal(decision.reason, "unknown_process");
}
{
  const decision = evaluate(act({ did: "register" }), catalog());
  assert.equal(decision.activation_state, "incompatible");
  assert.deepEqual(decision.field_levels.did, {
    predicate: "did.allowed",
    expected: ["request_projection"],
    observed: "register",
    passed: false,
    code: "did_not_admitted",
  });
}
{
  const decision = evaluate(act({ who: "mallory" }), catalog());
  assert.equal(decision.activation_state, "doubted");
  assert.equal(decision.reason, "who_not_authorized");
}
{
  const receipt = act();
  delete receipt.projection_spec;
  const decision = evaluate(receipt, catalog());
  assert.equal(decision.activation_state, "incompleto");
  assert.deepEqual(decision.missing_aux, ["projection_spec"]);
}
{
  const decision = evaluate(act(), catalog(contract({ adapters: [] })));
  assert.equal(decision.activation_state, "doubted");
  assert.equal(decision.reason, "no_adapter_configured");
}
{
  const decision = evaluate(act({ grant_id: "a".repeat(64) }), catalog(contract({ danger_tier: "L4" })));
  assert.equal(decision.activation_state, "ativável");
  assert.equal(decision.activate, true);
}
{
  const legacyRules = Object.fromEntries(slots.map((slot) => [slot, {
    meaning: `legacy ${slot}`,
    source: slotRules[slot].source,
    predicate: `${slot}.present`,
  }]));
  const decision = evaluate(act(), catalog(contract({ slot_rules: legacyRules, activation_rules_explicit: false })));
  assert.equal(decision.activation_state, "doubted");
  assert.equal(decision.reason, "activation_rules_not_explicit");
}
{
  const badRules = { ...slotRules, this: { ...slotRules.this, predicate: "this.magic" } };
  const decision = evaluate(act(), catalog(contract({ slot_rules: badRules })));
  assert.equal(decision.activation_state, "doubted");
  assert.equal(decision.field_levels.this.code, "unknown_predicate");
}

console.log("worker activation semantics: ok");
