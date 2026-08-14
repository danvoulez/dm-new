import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluate } from "../src/evaluator.ts";
import { SEED_CONTRACTS } from "../src/seed-contracts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const base = {
  process_id: "memory-register.v1",
  who: "tester",
  did: "registered",
  this: "runtime",
  when: "2026-06-22T00:00:00Z",
  confirmed_by: "test",
  if_ok: "memory-register.v1",
  if_doubt: "attention-raise.v1",
  if_not: "stop",
  status: "registered",
};
const forProcess = (processId, changes = {}) => {
  const semantics = {
    "attention-raise.v1": { did: "raise_attention", status: "registered", if_not: "stop" },
    "inference.v1": { did: "requested_inference", status: "candidate", if_not: "no_model" },
    "memory-register.v1": { did: "registered", status: "registered", if_not: "stop" },
    "projection-build.v1": { did: "build_projection", status: "registered", if_not: "stop", projection_spec: "runtime" },
    "route-to-devin.v1": { did: "route_to_devin", status: "registered", if_not: "stop" },
    "worker-run.v1": { did: "run_worker", status: "registered", if_not: "stop" },
  }[processId];
  return { ...base, process_id: processId, if_ok: processId, ...semantics, ...changes };
};
const vectors = [
  { name: "no-process", receipt: { ...base, process_id: undefined, if_ok: "projection-build.v1" } },
  { name: "unknown-process", receipt: { ...base, process_id: "missing.v1" } },
  { name: "memory-complete", process_id: "memory-register.v1", receipt: forProcess("memory-register.v1") },
  { name: "memory-incomplete", process_id: "memory-register.v1", receipt: forProcess("memory-register.v1", { who: "" }) },
  { name: "projection-incompatible-did", process_id: "projection-build.v1", receipt: forProcess("projection-build.v1", { did: "register" }) },
  { name: "route-missing-aux", process_id: "route-to-devin.v1", receipt: forProcess("route-to-devin.v1") },
  { name: "worker-missing-grant", process_id: "worker-run.v1", receipt: forProcess("worker-run.v1") },
  { name: "worker-with-grant", process_id: "worker-run.v1", receipt: forProcess("worker-run.v1", { grant_id: "a".repeat(64) }) },
  { name: "inference", process_id: "inference.v1", receipt: forProcess("inference.v1") },
  { name: "contract-only", process_id: "attention-raise.v1", receipt: forProcess("attention-raise.v1") },
];

const python = String.raw`
import json, sys
from lab.contracts import load_catalog
from lab.evaluator import evaluate
vectors=json.load(sys.stdin)
catalog=load_catalog()
keys=("activate","matched","reason","process_id","adapter","danger_tier","missing_slots","missing_aux","activation_state","registration_state","queueable","field_levels")
out=[]
for vector in vectors:
    decision=evaluate(vector["receipt"], vector.get("process_id"), catalog)
    out.append({k: decision.get(k) for k in keys})
json.dump(out, sys.stdout, ensure_ascii=False, sort_keys=True)
`;
const expected = JSON.parse(execFileSync("python3", ["-c", python], {
  cwd: root,
  input: JSON.stringify(vectors),
  encoding: "utf8",
}));

const catalog = new Map(SEED_CONTRACTS.map((seed) => [seed.process_id, seed.contract]));
const keys = ["activate", "matched", "reason", "process_id", "adapter", "danger_tier", "missing_slots", "missing_aux", "activation_state", "registration_state", "queueable", "field_levels"];
for (const [index, vector] of vectors.entries()) {
  const decision = evaluate(vector.receipt, catalog, vector.process_id);
  const actual = Object.fromEntries(keys.map((key) => [key, decision[key] ?? null]));
  assert.deepEqual(actual, expected[index], `evaluator parity failed: ${vector.name}`);
}

console.log(`worker evaluator parity: ok (${vectors.length} kernel vectors)`);
