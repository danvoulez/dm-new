# Day 1 — Runtime Activation Trace

The real decision path `Act registered → evaluate → selector → queue → executor → adapter`,
in terms of the code as it stands after the adapter-semantics correction.

## 1. Evaluator chooses process and adapter

`lab/evaluator.py`

- `evaluate(receipt, process_id)` resolves the `ProcessContract` (by `process_id`/`if_ok`,
  or by completeness match) — `evaluator.py:28`.
- The contract's adapter is reported on the decision as
  `decision["adapter"] = contract.adapters[0] if contract.adapters else None` — `evaluator.py:49`.
- Activation is gated, in order:
  - `process_not_active` if `status != "active"`,
  - `incomplete` if required slots / aux are missing,
  - `missing_required_grant` if L4/L5 and the Act carries no `grant_id`,
  - **`no_adapter_configured` if the contract names no adapter at all** (`evaluator.py:62`),
  - otherwise `activate=True, reason="complete"`.

The evaluator stays pure: it knows the *contract*, not which adapters are *implemented*.

## 2. Selectors queue the contract's decision (never a guess)

`lab/runtime.py`

- `receiver_select` (`runtime.py:367`) and `clock_select_due` (`runtime.py:168`) both:
  - call `evaluate(...)`,
  - **if activatable but `decision["adapter"] not in REGISTRY` → demote to a durable
    `adapter_not_registered` doubt** (`runtime.py:380` / `runtime.py:196`,
    via `_unregistered_adapter_block`),
  - else if activatable → `queue_add(..., decision["adapter"])` — the adapter comes from
    the resolved contract, **not** from `receipt.get("adapter", "receipt")`,
  - else → `raise_doubt(...)` carrying the evaluator's reason.

Selectors never call an adapter, never close a process, never write a fake result.

## 3. Queue is a projection of the decision

`lab/runtime.py`

- `queue_add` (`runtime.py:255`) stores `(source_hash, process_id, adapter)` with a
  `UNIQUE(source_hash, process_id, adapter)` idempotency key. It records, it does not
  reinterpret the contract.

## 4. Executor re-evaluates before dispatch

`lab/runtime.py:executor_run_once` (`runtime.py:543`), in order:

1. `evaluate(source, item["process_id"])` — re-derive the decision.
2. `if not activate → close_without_dispatch(...)` (`runtime.py:413`) — durable `not_dispatched` doubt.
3. `dangerous_control_decision(...)` (`runtime.py:490`) — full L4/L5 grant + passkey-signoff
   verification; any failure closes as a precise grant doubt.
4. **dispatch mismatch**: `if item["adapter"] != decision["adapter"]` → `dispatch_mismatch`
   doubt (`runtime.py:568`). A corrupted queue row never executes.
5. **adapter registration**: `if decision["adapter"] not in REGISTRY` → `adapter_not_registered`
   doubt (`runtime.py:573`). No real adapter → fail closed, never enqueue-then-crash.
6. Only now: `run_adapter(item["adapter"], ...)`, then evidence check, then `fechado`.

The grant gate (step 3) runs **before** the registration gate (step 5), so dangerous work
still surfaces its precise grant reasons rather than being masked by a missing adapter.

## Where selection stops and dispatch begins

- **Selector boundary:** `receiver_select` / `clock_select_due` end at `queue_add` or
  `raise_doubt`. No consequence.
- **Executor boundary:** `executor_run_once` is the only place `run_adapter` is called.
