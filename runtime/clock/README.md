# Clock Selector

Exposed as `lab clock tick`, `lab clock daemon`, and `lab clock backfill`.

The v0 implementation is intentionally selector-only and reports no direct execution. Due schedules should be converted into queued receipts, then dispatched by the executor.
