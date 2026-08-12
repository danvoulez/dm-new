# PROCESS RUNTIME SPEC

The fresh Lab runtime is implemented as a governed tree, not a daemon pile:

1. Receipts are appended to `logline_acts` through canonical receipt minting.
2. Selectors (`receiver`, `clock`) notice eligible records but do not execute effects.
3. The evaluator checks completeness against registered process contracts.
4. Activatable work is materialized into `runtime_queue`, a rebuildable execution projection keyed by `(source_hash, process_id, adapter)` for idempotency.
5. The executor claims one queued item, verifies the executor is not paused, re-runs `lab evaluate` for the queued process, and only dispatches a dumb adapter when the evaluation is activatable.
6. If evaluation returns `incompleto`, `doubted`, or another non-activatable state, the executor writes a `not_dispatched` receipt and closes the queue item without touching the adapter.
7. If evaluation is activatable, the executor writes `processando`, calls the adapter, writes a separate completion receipt, and only then closes the queue item.

Implemented production-local modules:

- `lab.receipt`: strict receipt v0 minting/verification, forbidden top-level field checks, deterministic hash material.
- `lab.store`: SQLite development mirror for `logline_acts` with generated slot columns, constraints, transactions, and typed not-found behavior.
- `lab.contracts`: process contract loading from `processes/*.v1.yml`.
- `lab.evaluator`: activation/freeze decisions based on process completion.
- `lab.process_catalog`: generated process catalog and runnable-process report derived from contracts, adapter registry, and grant/budget/sandbox policy.
- `lab.fleet`: machine registry and resident service allowlist audit.
- `lab.foundation`: wrapper around the bundled LogLine Foundation receipt conformance verifier.
- `lab.adapters`: executor-only adapter registry; adapters return AUX result fields and never write the ledger.
- `lab.runtime`: idempotent queue projection, selector-only receiver, selector-only clock, service pause state, and executor dispatcher.
- `lab.cli`: operational command surface for memory, scheduling, selection, queue, clock, executor, projection, and inference request registration.

Clock behavior now follows the implementation spec: `lab schedule` writes a scheduled receipt, `lab clock tick` selects due complete scheduled records, `lab clock backfill` selects within a requested window, and `lab clock now` reports selector time. Clock only queues; it never calls adapters or mutates the scheduled Act. `lab queue rebuild` restores due work from the ledger when the queue projection is lost. See `docs/RUNTIME_TREE.md` for the operational boundary.

Receiver and clock never perform final effects. Executor is the only dispatcher.

The fresh CLI surface includes the required memory and wake commands: `lab doctor`, `lab wake-spec`, `lab wake-handled`, and `lab wake-receipt`. Wake commands either inspect addressed records or write canonical ledger receipts; they do not dispatch adapters. `lab executor daemon` is exposed as a safe one-iteration daemon-compatible alias over the governed executor loop.

Manual queue insertion is not authority. A queued row can request work, but the source Act must still satisfy its process contract, grant rules, and danger-tier checks at executor time. This prevents incomplete or dangerous records from bypassing the evaluator by being pushed directly into `runtime_queue`.

`lab process generate` rewrites `processes/PROCESS_CATALOG.md` and `processes/CURRENT_RUNNABLE_PROCESSES.md` from `processes/*.v1.yml`. Runnable status is derived, not hand-maintained: configured safe adapters are runnable, missing adapters are contract-only, and L4/L5 adapters remain blocked until grant, budget, and sandbox enforcement are available.

Process contracts support both the compact legacy shape and the richer canon-facing shape in `processes/PROCESS_CONTRACT_TEMPLATE.yml`. Rich contracts may declare title, owner, process class, wake sources, required infrastructure, composition and target-hash rules, idempotency policy, activation ritual slots, required/optional AUX, authority grants, adapter danger tier, budget policy, evidence obligations, closure shape, doubt behavior, and runtime readiness checks. Activation still depends on complete receipt slots plus `activation_ritual.required_aux`; catalog generation exposes the richer metadata but does not make projections authoritative.

`lab fleet audit` checks the situated body: three registered machines, physical dependency evidence, service records, and the resident service allowlist. Unapproved service records are reported as failures rather than silently accepted.

Dangerous L4/L5 work must pass executor-time controls before adapter dispatch:

- `grant_id` present and accepted by the evaluator;
- `valid_until` is a future UTC timestamp;
- `acu_limit` covers the adapter cost;
- `timeout_seconds` is positive;
- `fs_scope` is present;
- `network_policy` is one of `none`, `restricted`, or `open`.

If any control fails, the executor writes `did:not_dispatched` with `status:doubted` and closes the queue item without calling the adapter. This keeps budget exhaustion, grant expiry, and missing sandbox scope visible in the ledger rather than becoming silent drops.

`lab foundation suite` runs the pinned LogLine Foundation conformance tree at `tests/fixtures/logline-foundation/conformance/` via `node conformance/tools/verify-receipt.mjs --suite`. `lab foundation verify-receipt <json-file>` runs the same reference verifier against an engine-generated receipt. A local receipt is not considered canon-compatible unless it passes both the Python verifier and the Foundation verifier.
