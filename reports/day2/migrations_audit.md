# Day 2 §1 — Migrations Audit (`0001`–`0003`)

Audit of the canonical Postgres ledger migrations against the runtime's expectations.
Files: `migrations/0001_logline_acts.sql`, `0002_realtime_publication.sql`,
`0003_rls_and_search_path.sql`; SQLite mirror in `lab/store.py:DDL`.

## `0001_logline_acts.sql` — the ledger table

| Element | Finding |
|---|---|
| `content_hash` PK | `text` with `~ '^[0-9a-f]{64}$'` — self-addressed by content hash. ✓ |
| `tuple_hash` | `not null`, same 64-hex check. ✓ |
| `act jsonb` | the canonical receipt body; everything else is derived from it. ✓ |
| Generated columns | `who, did, this, when_slot, confirmed_by, if_ok, if_doubt, if_not, status` projected from `act->>...` (stored). ✓ |
| `aux` generated | `act` minus envelope/identity/slot keys — the residual AUX, computed, never authored. ✓ |
| Identity checks | `id_matches_content_hash`, `tuple_hash_matches_act`, `receipt_version_matches_act`. ✓ |
| Version pin | `receipt_version = 'logline.receipt.v0'`. ✓ |
| Forbidden fields | `no_transport_in_act`, `no_result_in_act`, `no_evidence_in_act` via `not (act ? 'k')` — a resting Act carries no consequence. ✓ |
| Append-only | `prevent_logline_acts_mutation()` raises on `BEFORE UPDATE` and `BEFORE DELETE`. ✓ |
| Indexes | `if_ok, who, did, this, when_slot, status`. ✓ |

## `0002_realtime_publication.sql` — the bell

- Adds `public.logline_acts` to the `supabase_realtime` publication, idempotently
  (guarded by `pg_publication_tables`).
- Doctrine (SPEC §3.4): *the row is the durable event; Realtime is the bell.* A Realtime
  payload is never the only copy; the receiver always reads the ledger. **Postgres-only**
  — no SQLite analogue, and none required for bench.

## `0003_rls_and_search_path.sql` — the membrane

- `enable row level security` with **no policies**: anon/authenticated get nothing via the
  Data API; only `service_role` (which bypasses RLS) reads/inserts. The realtime receiver
  must subscribe with the service_role key. The "RLS enabled, no policy" advisor notice is
  **expected and intentional**.
- `set search_path = ''` on the mutation-block function (defense in depth; clears the
  `function_search_path_mutable` advisor).
- **Postgres-only.** SQLite has no RLS — see the parity report's caveat.

## Empirical spot-check (SQLite mirror)

```
UPDATE blocked  : logline_acts is append-only
DELETE blocked  : logline_acts is append-only
transport rejected  : ReceiptError        (receipt-mint layer)
result    rejected  : ReceiptError
evidence  rejected  : ReceiptError
transport:null rejected : constraint       (DB CHECK layer, mint bypassed)
count after attempts: 1                     (no mutation slipped through)
```

Forbidden fields are blocked at **two layers**: the receipt mint (`ReceiptError`) and the
DB `CHECK` (defense in depth) — the DB layer is what holds even on a raw insert.

## Acceptance (§1)

> SQLite local e Postgres migration contam a mesma história institucional — **met**
> (see `sqlite_postgres_parity.md` for the field-by-field comparison).
