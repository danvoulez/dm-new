import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluate } from "../src/evaluator.ts";
import { SEED_CONTRACTS } from "../src/seed-contracts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const base = {
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
const vectors = [
  { name: "memory-complete", process_id: "memory-register.v1", receipt: { ...base } },
  { name: "memory-incomplete", process_id: "memory-register.v1", receipt: { ...base, who: "" } },
  { name: "route-missing-aux", process_id: "route-to-devin.v1", receipt: { ...base, if_ok: "route-to-devin.v1", process_id: "route-to-devin.v1" } },
  { name: "worker-missing-grant", process_id: "worker-run.v1", receipt: { ...base, if_ok: "worker-run.v1", process_id: "worker-run.v1" } },
  { name: "worker-with-grant", process_id: "worker-run.v1", receipt: { ...base, if_ok: "worker-run.v1", process_id: "worker-run.v1", grant_id: "a".repeat(64) } },
  { name: "inference", process_id: "inference.v1", receipt: { ...base, if_ok: "inference.v1", process_id: "inference.v1" } },
  { name: "contract-only", process_id: "attention-raise.v1", receipt: { ...base, if_ok: "attention-raise.v1", process_id: "attention-raise.v1" } },
];

const python = String.raw`
import json, sys
from lab.contracts import load_catalog
from lab.evaluator import evaluate
vectors=json.load(sys.stdin)
catalog=load_catalog()
keys=("activate","matched","reason","process_id","adapter","danger_tier","missing_slots","missing_aux","activation_state","queueable")
out=[]
for vector in vectors:
    decision=evaluate(vector["receipt"], vector["process_id"], catalog)
    out.append({k: decision.get(k) for k in keys})
json.dump(out, sys.stdout, ensure_ascii=False, sort_keys=True)
`;
const expected = JSON.parse(execFileSync("python3", ["-c", python], {
  cwd: root,
  input: JSON.stringify(vectors),
  encoding: "utf8",
}));

const catalog = new Map(SEED_CONTRACTS.map((seed) => [seed.process_id, seed.contract]));
const keys = ["activate", "matched", "reason", "process_id", "adapter", "danger_tier", "missing_slots", "missing_aux", "activation_state", "queueable"];
for (const [index, vector] of vectors.entries()) {
  const decision = evaluate(vector.receipt, catalog, vector.process_id);
  const actual = Object.fromEntries(keys.map((key) => [key, decision[key] ?? null]));
  assert.deepEqual(actual, expected[index], `evaluator parity failed: ${vector.name}`);
}

console.log(`worker evaluator parity: ok (${vectors.length} kernel vectors)`);
