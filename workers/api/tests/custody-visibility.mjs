import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("../src/runtime.ts", import.meta.url), "utf8");
const legacy = fs.readFileSync(new URL("../src/legacy-runtime.ts", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../src/universal-tools.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

// Canonical visibility is process replay + current custody, never the old adapter queue.
assert.match(runtime, /did='opened_process'/);
assert.match(runtime, /processCurrentState/);
assert.match(runtime, /currentCustod(?:y|ies)/);
assert.doesNotMatch(runtime, /public\.runtime_queue/);
assert.doesNotMatch(runtime, /JOIN public\.process_contracts/);
assert.doesNotMatch(runtime, /PENDENCY_DIDS|CLOSED_DIDS|TIMELINE_LABELS/);

// All runtime_queue SQL is quarantined behind the compatibility module.
assert.match(legacy, /public\.runtime_queue/);
assert.match(legacy, /legacyReceiverSelect/);
assert.match(legacy, /legacyExecutorRunOnce/);
assert.match(legacy, /coalesce\(act->'envelope'->>'process',''\)=''/);
assert.match(legacy, /did <> 'opened_process'/);

// Canonical append can call compatibility only after deterministic process routing declines ownership.
assert.match(tools, /routeProcessReceipt/);
assert.match(tools, /legacyReceiverSelect/);
assert.doesNotMatch(tools, /from "\.\/runtime"/);

// Raw semantic registration must not exist as a public route.
assert.doesNotMatch(worker, /app\.post\("\/api\/register"/);
assert.match(worker, /app\.post\("\/api\/append"/);

const custodyIndex = runtime.indexOf("custodyExecutorRunOnce");
const legacyIndex = runtime.indexOf("legacyExecutorRunOnce");
assert.ok(custodyIndex >= 0 && legacyIndex > custodyIndex, "custody executor must have precedence over legacy executor");

console.log("custody visibility: process replay/current custody canonical; runtime_queue quarantined");
