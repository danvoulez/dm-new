# Day 2 §7 — Append-Only SQLite Report

The bench SQLite ledger does not allow rewriting history. Verified by
`tests/test_append_only_sqlite.py` (5 tests) and `tests/test_resting_act_forbidden_fields.py`.

## Three independent immutability layers

| Layer | Mechanism | What it blocks | Error |
|---|---|---|---|
| **Generated columns** | `who…status, aux` are `GENERATED ALWAYS … STORED` | direct rewrite of any derived slot/AUX | `OperationalError: cannot UPDATE generated column` |
| **Append-only triggers** | `BEFORE UPDATE` / `BEFORE DELETE` → `RAISE(ABORT, 'logline_acts is append-only')` | any UPDATE/DELETE on real columns (act, receipt_version, envelope_*) | `IntegrityError: logline_acts is append-only` |
| **Envelope CHECKs** | `CHECK(json_type(act,'$.transport') IS NULL)` etc. | inserting a body that carries `transport/result/evidence` | `IntegrityError: CHECK constraint failed` |

## Evidence (from the test run)

- `UPDATE … SET receipt_version` on an admitted receipt → blocked (`append-only`).
- `DELETE` of an admitted receipt → blocked (`append-only`).
- `UPDATE … SET act = '{}'` (rewriting the body / its derived AUX) → blocked (`append-only`).
- `UPDATE … SET envelope_hash/sent_to` (envelope columns) → blocked (`append-only`).
- `UPDATE … SET status` (a generated column) → blocked (`generated column`).
- After all attempts, `count == 1` — nothing slipped through.

## Acceptance (§7)

> ledger local não permite reescrever história — **met**, on three independent layers.

## Note carried to §8

This is the *bench* enforcement. The same guarantees must hold on Postgres/Supabase via the
table triggers and RLS — see `append_only_postgres_report.md`.
