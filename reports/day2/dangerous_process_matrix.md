# Day 2 §22 — Dangerous Process Matrix

What can and cannot run before the physical machines exist. Derived from the process
contracts (`danger_tier`, `adapters`), the adapter registry, and the grant model. Pinned by
`tests/test_grants_danger_tiers.py` and `tests/test_process_catalog.py`.

| process_id | tier | adapter | grant | signature | budget | scope | bench | bootstrap | production |
|---|---|---|---|---|---|---|---|---|---|
| memory-register.v1 | L0 | receipt ✅ | – | – | – | – | ✅ run | ✅ | ✅ |
| projection-build.v1 | L1 | projection ✅ | – | – | – | – | ✅ run | ✅ | ✅ |
| inference.v1 | L3 | inference ✅ | – | – | – | – | ✅ run | ✅ | ✅ |
| attention-raise.v1 | L0 | — | – | – | – | – | contract-only | — | — |
| evidence-closure.v1 | L0 | — | – | – | – | – | contract-only | — | — |
| github-check.v1 | L0→L3 | — (Day 6) | – | – | – | – | contract-only | dry-run | ✅ w/ App |
| route-to-devin.v1 | L4 | route_to_devin ❌unreg | ✅ | ✅ | ✅ | ✅ | ❌ blocked | dry-run | ✅ w/ grant |
| worker-run.v1 | L4 | worker_run ❌unreg | ✅ | ✅ | ✅ | ✅ | ❌ blocked | dry-run | ✅ w/ grant |
| workflow-run.v1 | L5 | workflow_run ❌unreg | ✅ | ✅ | ✅ | ✅ | ❌ blocked | ❌ | ✅ strong grant |
| notification.v1 | L5 | — (Day 6) | ✅ | ✅ | ✅ | ✅ | ❌ blocked | ❌ | ✅ airlock |

Legend: ✅run = executes in bench today; contract-only = matched but no adapter → `no_adapter_configured`;
blocked = grant-gated (`missing_required_grant`) and/or adapter unregistered (`adapter_not_registered`).

## What is safe to run in bench today

`memory-register.v1`, `projection-build.v1`, `inference.v1` — all L0–L3 with registered
adapters, no grant required.

## What cannot run before the machines / doors exist

- **L4/L5** (`worker-run`, `workflow-run`, `route-to-devin`, `notification`): grant-gated and
  adapter-unregistered (or no adapter). Fail closed.
- **Contract-only** (`attention-raise`, `evidence-closure`, `github-check`): no adapter; never
  enqueue as a receipt.

## Acceptance (§22)

> fica claro o que pode e o que não pode rodar antes dos computadores — **met**: the matrix is
> derived from contracts + registry + grant model and pinned by test, so it cannot silently drift.
