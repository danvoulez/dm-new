import type { PgClient } from "./db";

/** Idempotent operational migration for ephemeral custody execution leases. */
export async function migrateCustodyExecutor(client: PgClient): Promise<void> {
  await client.query(`
    alter table public.runtime_custody_queue
      add column if not exists attempts integer not null default 0;

    alter table public.runtime_custody_queue
      drop constraint if exists runtime_custody_queue_attempts_nonnegative;
    alter table public.runtime_custody_queue
      add constraint runtime_custody_queue_attempts_nonnegative check (attempts >= 0);

    alter table public.runtime_custody_queue
      add column if not exists last_error text;

    alter table public.runtime_custody_queue
      add column if not exists result_tuple text;

    alter table public.runtime_custody_queue
      drop constraint if exists runtime_custody_queue_result_tuple_hash;
    alter table public.runtime_custody_queue
      add constraint runtime_custody_queue_result_tuple_hash
      check (result_tuple is null or result_tuple ~ '^[0-9a-f]{64}$');

    create index if not exists runtime_custody_queue_claim_idx
      on public.runtime_custody_queue(responsible,status,lease_until,created_at,queue_id);
  `);
}
