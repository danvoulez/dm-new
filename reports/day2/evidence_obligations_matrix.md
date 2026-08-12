# Day 2 §14 — Evidence Obligations Matrix

> The executor does not close a process without the minimum declared evidence.

What each runnable process must prove (`evidence_must_include`), what its adapter actually
emits, and where the gaps are. Enforcement: `lab/runtime.py:missing_evidence` +
`close_evidence_incomplete`; tests in `test_evidence.py`, `test_evidence_incomplete.py`,
`test_evidence_complete.py`.

## Matrix

| Process | Tier | `evidence_must_include` | Adapter emits | Status |
|---|---|---|---|---|
| inference.v1 | L3 | `output_hash`, `schema_hash` | `output_hash`, `schema_hash`, `prompt_hash`, `input_hashes`, `projection_hashes` | ✅ **real & satisfiable** — incomplete→doubt, complete→fechado, both proven |
| memory-register.v1 | L0 | *(none)* | `source_hash`, `adapter_class` | ⚠️ **no obligation declared** (gap) |
| projection-build.v1 | L1 | *(none)* | `source_hash`, `adapter_class`, `projection_authoritative/rebuildable` | ⚠️ **no obligation declared**; adapter emits no `projection_hash` (gap) |
| route-to-devin.v1 | L3 | *(none — `must_include` is activation aux, not evidence)* | n/a (adapter unregistered) | deferred to Day 6 |
| worker-run / workflow-run | L4/L5 | *(none)* | n/a (adapter unregistered) | deferred (grant-gated; Day 6) |
| attention/evidence-closure/github-check/notification | L0 | *(none)* | n/a (contract-only) | n/a until they have doors |

## Findings (per §14: "identify processes without obligation / too-generic obligations")

1. **Only `inference.v1` carries a real, satisfiable evidence obligation today.** Its
   incomplete and complete paths are fixture-tested (§15/§16).
2. **`memory-register.v1` has no obligation.** The receipt adapter emits `source_hash`; a
   future obligation `[source_hash]` would make every local-write close prove its source.
   *Not added in this pass* (it changes a runnable process's close semantics — surfaced as a
   deliberate decision rather than a silent change).
3. **`projection-build.v1` has no obligation and its adapter emits no `projection_hash`.** The
   roadmap envisions `[projection_hash, input_hashes]`. This belongs with the **Day 4**
   projection work (the adapter must first emit a projection hash). Tracked there.
4. **`github-check.v1` (future `check_result`) and the Devin/worker doors** are contract-only
   or unregistered today; their obligations land with **Day 6**.

No obligation is **too generic**: the one real obligation (`inference`) names specific
content hashes, not a vague "evidence present" flag.

## Acceptance (§14)

> executor não fecha processo sem evidência mínima declarada — **met** for the process that
> declares one (`inference.v1`); the absence of obligations elsewhere is documented as
> explicit gaps mapped to Day 4 / Day 6, not hidden.
