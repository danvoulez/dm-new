import assert from "node:assert/strict";
import { loadContracts, toProcessTypeView } from "../src/contracts.ts";

const slotRules = {
  who: { meaning: "autoridade solicitante", source: "session", predicate: "who.authorized" },
  did: { meaning: "ato admitido", source: "llm", predicate: "did.allowed", values: ["request_projection"] },
  this: { meaning: "alvo canônico da projeção", source: "llm", predicate: "this.canonical" },
};

const view = toProcessTypeView({
  process_id: "projection-semantic.v1",
  title: "Projection Semantic Contract",
  status: "active",
  slot_rules: slotRules,
  registered_hash: "a".repeat(64),
});

assert.deepEqual(view.slot_rules, slotRules);
assert.equal(view.registered_hash, "a".repeat(64));

const loaded = await loadContracts({
  async query() {
    return {
      rows: [{
        process_id: "projection-semantic.v1",
        title: "Projection Semantic Contract",
        status: "active",
        registered_hash: "b".repeat(64),
        contract: { process_id: "ignored", slot_rules: slotRules },
      }],
    };
  },
});

assert.equal(loaded.get("projection-semantic.v1")?.registered_hash, "b".repeat(64));

console.log("worker contract semantics: ok");
