# Day 2 §8 — Append-Only Postgres Report (Supabase readiness)

Review of the append-only guarantee on the canonical Postgres ledger
(`migrations/0001_logline_acts.sql`, `0003_rls_and_search_path.sql`). No live Postgres is
exercised here; this is a migration review against the Supabase deployment model.

## Update trigger

`prevent_logline_acts_mutation()` raises `'public.logline_acts is append-only'`; bound to
`logline_acts_no_update` `BEFORE UPDATE FOR EACH ROW`. Any UPDATE aborts. ✓

## Delete trigger

Same function bound to `logline_acts_no_delete` `BEFORE DELETE FOR EACH ROW`. Any DELETE
aborts. ✓ (mirrors the SQLite `RAISE(ABORT)` triggers — parity holds.)

## Expected permissions (Supabase)

- **RLS enabled, no policies** (`0003`): anon/authenticated receive nothing through the Data
  API (PostgREST). Only `service_role` — which bypasses RLS — reads/inserts. The realtime
  receiver must subscribe with the service_role key.
- INSERT is the only write path; UPDATE/DELETE are blocked by trigger for *every* role that
  goes through the table (triggers are not bypassed by RLS or by service_role).

## RLS vs. improper write

- Reads/writes via the Data API are gated by RLS (no policy ⇒ denied for anon/authenticated).
- Even a role that can INSERT cannot rewrite history: the triggers stop UPDATE/DELETE
  regardless of role.

## Migration idempotency

- `create table if not exists`, `create index if not exists` — safe to re-run. ✓
- `drop trigger if exists … ; create trigger …` — re-runnable. ✓
- `create or replace function …` — re-runnable. ✓
- Realtime add-to-publication guarded by a `pg_publication_tables` existence check. ✓
- `enable row level security` and `alter function … set search_path = ''` are idempotent. ✓

## Honest caveat (defense-in-depth, not absolute)

Append-only is enforced by **triggers**, which the table **owner** (`postgres`) could disable
via `ALTER TABLE … DISABLE TRIGGER`. The Supabase `service_role` is **not** the table owner,
so it cannot disable them — but this means immutability is an *operational* guarantee resting
on owner discipline, not a physical impossibility. Cryptographic content-addressing (the
`content_hash` PK + identity CHECKs) is the deeper guarantee: a tampered row cannot keep its
hash. This pairs with the §11 authority work (authorship ≠ integrity).

## Acceptance (§8)

> bootstrap Supabase não depende de confiança manual para preservar história — **met** for
> the normal runtime/service_role path (triggers + content-addressing); the owner-disable
> vector is documented above for the Day 6 GitHub/secrets hardening to account for.
