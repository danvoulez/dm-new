import assert from "node:assert/strict";
import { readiness } from "../src/contracts.ts";

const slots = ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"];
const explicitRules = Object.fromEntries(slots.map((slot) => [slot, {
  meaning: `meaning for ${slot}`,
  source: "llm",
  predicate: `${slot}.present`,
}]));

assert.deepEqual(readiness({
  process_id: "safe",
  status: "active",
  adapters: ["receipt"],
  danger_tier: "L0",
  slot_rules: explicitRules,
  activation_rules_explicit: true,
}), {
  runnable: true,
  readiness: "runnable",
  readiness_reason: "contract active and adapter configured",
});
assert.deepEqual(readiness({ process_id: "legacy", status: "active", adapters: ["receipt"], danger_tier: "L0" }), {
  runnable: false,
  readiness: "contract-only",
  readiness_reason: "activation ritual lacks explicit semantic rules",
});

for (const [label, brokenRule] of [
  ["unknown source", { meaning: "authority", source: "browser", predicate: "who.authorized" }],
  ["empty predicate", { meaning: "authority", source: "session", predicate: "" }],
  ["invalid values", { meaning: "authority", source: "session", predicate: "who.authorized", values: "dan" }],
]) {
  assert.deepEqual(readiness({
    process_id: `invalid-${label}`,
    status: "active",
    adapters: ["receipt"],
    danger_tier: "L0",
    slot_rules: { ...explicitRules, who: brokenRule },
    activation_rules_explicit: true,
  }), {
    runnable: false,
    readiness: "contract-only",
    readiness_reason: "activation ritual contains invalid semantic rules",
  });
}
assert.equal(readiness({
  process_id: "dangerous",
  status: "active",
  adapters: ["receipt"],
  danger_tier: "L5",
  slot_rules: explicitRules,
  activation_rules_explicit: true,
}).readiness, "blocked");
assert.equal(readiness({ process_id: "future", status: "active", adapters: ["inference"], danger_tier: "L5" }).readiness, "contract-only");
assert.equal(readiness({ process_id: "empty", status: "active", adapters: [] }).readiness, "contract-only");
assert.equal(readiness({ process_id: "off", status: "inactive", adapters: ["receipt"] }).readiness, "not-runnable");

console.log("worker process readiness: ok");
