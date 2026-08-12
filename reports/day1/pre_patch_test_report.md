# Day 1 — Pre-Patch Test Report

Snapshot taken before the runtime adapter-semantics correction.
Commit base: 5fd194c (day1/runtime-adapter-semantics)
Date: 2026-06-23

```
........................................................................ [ 52%]
.................................................................        [100%]
137 passed in 1.68s
```

## Known defects this snapshot still exhibits (reproduced manually)

- `projection-build.v1` evaluates with adapter `projection` but is **enqueued as `receipt`** (selector hardcodes `receipt.get("adapter","receipt")`).
- `attention-raise.v1` (`adapters: []`) evaluates `activate=True, adapter=None` and is **enqueued as `receipt`** instead of raising `no_adapter_configured` — a contract-only process becoming a receipt completion.
