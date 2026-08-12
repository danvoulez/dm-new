# Day 2 §2 — SQLite / Postgres Parity

Goal: ensure no **silent** difference between the bench SQLite store (`lab/store.py:DDL`)
and the canonical Postgres migrations (`migrations/0001–0003`) alters **authority,
append-only, or the envelope**. Tolerated differences are listed explicitly.

## Fields present on both sides

`content_hash` (PK), `tuple_hash`, `receipt_version`, `act`, `inserted_at`,
`envelope_hash`, `sent_by`, `sent_to`, `sent_at`, `channel`, and the generated
`who, did, this, when_slot, confirmed_by, if_ok, if_doubt, if_not, status, aux`. **Full parity.**

## Constraints present on both sides

| Invariant | Postgres | SQLite | Equivalent? |
|---|---|---|---|
| hash format | `~ '^[0-9a-f]{64}$'` | `length=64 AND NOT GLOB '*[^0-9a-f]*'` | ✓ |
| id = content_hash | `act->>'id' = content_hash` | `json_extract(act,'$.id') = content_hash` | ✓ |
| tuple_hash match | `act->'hashes'->>'tuple_hash'` | `json_extract(act,'$.hashes.tuple_hash')` | ✓ |
| version pin | `= 'logline.receipt.v0'` | `= 'logline.receipt.v0'` | ✓ |
| no transport/result/evidence | `not (act ? 'k')` | `json_type(act,'$.k') IS NULL` | ✓ (see note) |
| append-only update/delete | trigger `raise exception` | trigger `RAISE(ABORT,...)` | ✓ |

**Note on forbidden-field check:** PG's `act ? 'k'` tests *key presence*; SQLite's
`json_type(act,'$.k') IS NULL` returns SQL NULL only when the path is **absent** (a JSON
`null` value yields the text `'null'`, not SQL NULL). So both reject `"transport": null`
identically — verified empirically (`transport:null rejected : constraint`). No silent gap.

## Tolerated differences (operational layers, not semantics)

| Difference | Side | Why tolerated |
|---|---|---|
| Realtime publication (`0002`) | PG only | Realtime is the bell, not authority; ledger is the source of truth. Bench needs no bell. |
| RLS enabled, no policies (`0003`) | PG only | Access-control membrane for the Data API. **See caveat below.** |
| `search_path=''` on trigger fn (`0003`) | PG only | PG function hardening; no SQLite analogue. |
| extra `inserted_at` index | SQLite only | Local query perf; no semantic effect. |
| `schema_meta.schema_version=3` | SQLite | Mirrors the `0001–0003` migration count. |

## Dangerous-difference scan

**None silent.** Every difference above is an additive Postgres operational layer
(realtime, RLS, search_path) or a benign local index. The dimensions that define the
institution — **append-only, hash/identity integrity, envelope forbidden-fields, and the
`logline.receipt.v0` version pin — are byte-for-byte equivalent in intent and verified at
runtime.**

## ⚠️ Caveat to carry into bootstrap (feeds §6 bench/prod boundary)

SQLite has **no RLS and no service_role boundary** — the bench store has no access-control
membrane. This is acceptable *only* because bench is single-user local and **must never
hold real authority**. The bench/prod boundary (§6, `LAB_MODE`) must make this explicit so
a bench ledger is never mistaken for the real Lord's-birth ledger.

## Acceptance (§2)

> nenhuma diferença silenciosa altera autoridade, append-only ou envelope — **met.**
