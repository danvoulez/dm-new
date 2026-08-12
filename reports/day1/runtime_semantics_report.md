# Runtime Semantics Report v0 (Day 1)

> Selectors select. Executor dispatches. Contracts choose adapters. Contract-only does not run.

State of the central runtime path after the Day 1 adapter-semantics correction. Authoritative
for "what is safe to run" without re-reading the whole tree.

## Process runnability (runtime ⇄ generated catalog, in agreement)

| Process | Tier | Adapter | Runtime outcome | Why |
|---|---|---|---|---|
| memory-register.v1 | L0 | receipt | **runnable** | active, complete, adapter registered |
| projection-build.v1 | L1 | projection | **runnable** | active, complete, adapter registered |
| inference.v1 | L3 | inference | **runnable** | active, complete, adapter registered |
| attention-raise.v1 | L0 | — | **doubt** `no_adapter_configured` | contract-only (no adapter named) |
| evidence-closure.v1 | L0 | — | **doubt** `no_adapter_configured` | contract-only |
| github-check.v1 | L0 | — | **doubt** `no_adapter_configured` | contract-only |
| notification.v1 | L0 | — | **doubt** `no_adapter_configured` | contract-only |
| route-to-devin.v1 | L3 | route_to_devin | **doubt** `adapter_not_registered` | adapter declared but unimplemented |
| worker-run.v1 | L4 | worker_run | **doubt** `missing_required_grant` → (if granted) `adapter_not_registered` | dangerous; adapter unimplemented |
| workflow-run.v1 | L5 | workflow_run | **doubt** `missing_required_grant` → (if granted) `adapter_not_registered` | dangerous; adapter unimplemented |

Registered adapters: `receipt`, `projection`, `inference` (`lab/adapters.py:REGISTRY`).

## What changed on Day 1

1. **Adapter comes from the contract.** Selectors now queue `decision["adapter"]` instead of
   `receipt.get("adapter", "receipt")`. `projection-build.v1` enqueues as `projection`, not `receipt`.
2. **Contract-only does not run.** A matched, complete, active contract with no adapter is doubted
   (`no_adapter_configured`), never enqueued as a receipt.
3. **No real adapter, no run.** A contract naming an unimplemented adapter is doubted
   (`adapter_not_registered`) at both the selector and the executor — it never enqueues-then-crashes.
4. **Executor refuses corrupted queues.** If the queued adapter disagrees with the re-evaluated
   contract, the executor writes `dispatch_mismatch` instead of dispatching.
5. **Canonical doubt vocabulary.** `lab/runtime.py:DOUBT_REASONS` declares the closed set of
   procedural-barrier reasons; doubts are structured states, not free text.

## Selector vs executor boundary

- Selectors (`receiver_select`, `clock_select_due`) only evaluate, queue, or doubt.
- The executor (`executor_run_once`) is the only dispatcher and re-validates every item
  (activation → grant → dispatch-mismatch → adapter-registration) before calling `run_adapter`.

## Regressions added

- `tests/test_runtime_adapter_semantics.py` — projection-build adapter, contract-only doubt,
  evaluator no-adapter block, dispatch-mismatch refusal, canonical-reason vocabulary.
- `tests/test_runtime.py::test_executor_refuses_contract_adapter_without_registered_implementation`
  and `::test_run_adapter_rejects_unknown_adapter_name`.
- `tests/test_signing.py::test_executor_reaches_adapter_only_with_valid_signed_grant` updated:
  a fully-verified grant now stops at `adapter_not_registered`, proving the grant/signoff chain
  passed first.

## Acceptance (Day 1)

- suite green; new regressions green
- no execution without an adapter
- no wrong adapter in the queue
