-- 0002 — Realtime discipline.
-- Mirrors canonical ActGraph/migrations/0007_realtime_publication.sql:1-13
-- (Amendment 1, queue item 4 / 06-canon §30; applied live in ActGraph 2026-06-11).
-- Per LAB FINAL IMPLEMENTATION SPEC v0 §3.4:
--   The row is the durable event; Realtime is the bell. Realtime wakes the
--   receiver; the ledger feeds the receiver. A Realtime payload is NEVER the
--   only copy of anything. Receiver always reads the ledger.
-- Depends on: 0001_logline_acts.sql (public.logline_acts must exist).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'logline_acts'
  ) then
    alter publication supabase_realtime add table public.logline_acts;
  end if;
end $$;
