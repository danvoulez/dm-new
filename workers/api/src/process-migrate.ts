import type { PgClient } from "./db";

/** Idempotent operational migration for process-instance custody runtime. */
export async function migrateProcessMachine(client: PgClient): Promise<void> {
  await client.query(`
    create index if not exists logline_acts_process_instance_idx
      on public.logline_acts ((act->'envelope'->>'process'));
    create index if not exists logline_acts_parent_tuple_idx
      on public.logline_acts ((act->'envelope'->>'parent'));
    create index if not exists logline_acts_process_type_idx
      on public.logline_acts ((act->>'process_type'));
    create unique index if not exists logline_acts_process_parent_unique
      on public.logline_acts ((act->'envelope'->>'process'), (act->'envelope'->>'parent'))
      where act->'envelope'->>'process' is not null
        and act->'envelope'->>'parent' is not null;

    create table if not exists public.runtime_custody_queue (
      queue_id text primary key,
      process_instance text not null check (process_instance ~ '^[0-9a-f]{64}$'),
      node text not null,
      responsible text not null,
      source_tuple text not null check (source_tuple ~ '^[0-9a-f]{64}$'),
      status text not null default 'queued' check (status in ('queued','claimed','closed')),
      claimed_by text,
      lease_until timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(process_instance,node,source_tuple)
    );

    create index if not exists runtime_custody_queue_ready_idx
      on public.runtime_custody_queue(status,responsible,created_at);
    create index if not exists runtime_custody_queue_process_idx
      on public.runtime_custody_queue(process_instance,status);
  `);
}
