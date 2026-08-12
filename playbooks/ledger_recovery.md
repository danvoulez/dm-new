# Playbook — Ledger Recovery (bench)

A local bench problem has a clear procedure before any real bootstrap. All of this is
**bench-only** (`LAB_MODE=bench`); never run destructive recovery against a real ledger.

## First, orient

```
LAB_MODE=bench lab bootstrap status --db .lab/test.sqlite   # mode, count, schema_version, has_genesis
lab doctor                                                  # ledger + executor health
```

## Scenarios

| Symptom | Diagnosis | Recovery |
|---|---|---|
| **Schema absent** (no tables) | fresh/empty path | `lab bootstrap local` recreates schema; `lab bootstrap genesis` stamps the origin. |
| **Schema old** (`schema_version` < current) | DB predates a migration | bench is disposable: `lab bootstrap reset-bench` then `genesis`. (Never reset a real ledger.) |
| **Corrupt bench DB** | SQLite errors / integrity failures | `lab bootstrap reset-bench` (safety-gated: bench `.lab/*.sqlite` only) then re-seed. |
| **Inconsistent queue** | queue rows disagree with the ledger | the queue is a projection — `lab queue rebuild` re-derives it from `logline_acts` (authoritative). |
| **Stale projection** | a projection lags the ledger | projections are rebuildable, never authority — rebuild from sources (Day 4 tooling). |
| **Incomplete migration** | partial schema apply | bench: reset and re-bootstrap. Postgres/bootstrap: re-run the idempotent migrations (`0001–0003`). |

## Invariants to never violate

- The ledger is **append-only**: recovery never UPDATEs/DELETEs history — it reseeds a bench DB
  or rebuilds projections/queue *from* the ledger.
- `reset-bench` only ever targets a `.sqlite` under `<repo>/.lab` and refuses the real ledger,
  `HOME`, `/`, and any non-bench `LAB_MODE` (see `docs/BENCH_VS_BOOTSTRAP.md`).
- The queue and projections are derived; the ledger is the source of truth. Recover *downward*
  (re-derive), never *upward* (never invent ledger history to match a projection).
