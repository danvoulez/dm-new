import assert from "node:assert/strict";
import { readiness } from "../src/contracts.ts";

assert.deepEqual(readiness({ process_id: "safe", status: "active", adapters: ["receipt"], danger_tier: "L0" }), {
  runnable: true,
  readiness: "runnable",
  readiness_reason: "contract active and adapter configured",
});
assert.equal(readiness({ process_id: "dangerous", status: "active", adapters: ["receipt"], danger_tier: "L5" }).readiness, "blocked");
assert.equal(readiness({ process_id: "future", status: "active", adapters: ["inference"], danger_tier: "L5" }).readiness, "contract-only");
assert.equal(readiness({ process_id: "empty", status: "active", adapters: [] }).readiness, "contract-only");
assert.equal(readiness({ process_id: "off", status: "inactive", adapters: ["receipt"] }).readiness, "not-runnable");

console.log("worker process readiness: ok");
