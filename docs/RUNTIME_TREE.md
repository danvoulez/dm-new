# Runtime Tree — Ledger, Selectors, Queue, Executor

This Lab runtime is intentionally small, but the boundaries are strict:

1. `logline_acts` is authority.
2. Selectors observe authority and materialize rebuildable projections.
3. `runtime_queue` is a projection, never custody.
4. Executor is the only dispatcher that calls adapters.
5. Adapters are dumb leaves and return AUX fields; they do not write truth directly.

## Scheduling path

`lab schedule <did> <this> --at <utc> --process <process_id>` writes a normal
canonical receipt with `status=scheduled`. The scheduled Act remains unchanged.

`lab clock tick --now-at <utc>` reads due `status=scheduled` receipts, evaluates
completeness against process contracts, and calls `queue_add` only for activatable
records. Incomplete scheduled records appear in the selector report with
`queued=null`.

`lab clock backfill --from <utc> --to <utc>` applies the same selector law inside a
bounded historical window. Backfill also only queues.

## Queue rebuild

`runtime_queue` can be dropped and rebuilt because its source is the ledger. Use:

```bash
lab queue rebuild --now-at 2026-06-22T00:01:00Z
lab queue rebuild --from 2026-06-22T00:00:00Z --to 2026-06-22T01:00:00Z
```

The rebuild path recreates the queue projection and replays the selector-only
clock logic over due scheduled receipts or a bounded historical window. Duplicate
queue rows are still prevented by `(source_hash, process_id, adapter)` idempotency.

## Non-authority guarantees

- Clock does not call adapters.
- Receiver does not call adapters.
- Queue rows are not truth.
- Projection rebuild does not mutate source Acts.
- Executor completion is a separate receipt.
