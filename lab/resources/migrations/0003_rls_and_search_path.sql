-- 0003 — Restore canon fidelity on public.logline_acts.
-- The local 0001 scaffold diverged from canonical ActGraph/migrations/0001_logline_acts.sql,
-- which (a) enables RLS with NO policies and (b) pins the mutation-block function's
-- search_path. This forward migration brings the live ledger back in line. (0001 is
-- already applied, so we amend forward rather than rewrite history.)

-- RLS on, no policies: anon/authenticated get nothing via the Data API (PostgREST).
-- Only service_role (the runtime/Rust gate) — which bypasses RLS — may read/insert.
-- The realtime receiver MUST therefore subscribe with the service_role key.
-- The resulting "RLS enabled, no policy" advisor notice is EXPECTED and INTENTIONAL.
alter table public.logline_acts enable row level security;

-- Pin search_path empty: the function references no objects, so '' is safe and
-- clears the function_search_path_mutable advisor (defense in depth).
alter function public.prevent_logline_acts_mutation() set search_path = '';
