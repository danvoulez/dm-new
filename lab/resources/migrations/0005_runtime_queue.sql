-- Rebuildable executor queue projection. Authority remains public.logline_acts.
create table if not exists public.runtime_queue (
  queue_id text primary key,
  source_hash text not null references public.logline_acts(content_hash),
  process_id text not null,
  adapter text not null,
  status text not null default 'queued' check(status in ('queued','claimed','closed','failed','released')),
  attempts integer not null default 0,
  claimed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  result_hash text references public.logline_acts(content_hash),
  last_error text,
  unique(source_hash, process_id, adapter)
);
create index if not exists runtime_queue_status_idx on public.runtime_queue(status, created_at);
comment on table public.runtime_queue is 'Rebuildable runtime projection; public.logline_acts remains authoritative.';
