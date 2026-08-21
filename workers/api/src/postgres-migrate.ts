import type { PgClient } from "./db";
import { migrateLedgerRegistry } from "./ledger-registry";

/**
 * Upgrade the canonical Postgres ledger from receipt v0 storage assumptions to v1.
 *
 * This is intentionally idempotent because `/api/migrate` is an operational bootstrap
 * endpoint. It preserves every historical row byte-for-byte, changes row identity from
 * content_hash to tuple_hash, makes content_hash a non-unique semantic index, and then
 * installs the pure ledger-native registry projections used by Phase 2 runtime discovery.
 */
export async function migrateReceiptV1(client: PgClient): Promise<void> {
  await client.query(`
    alter table if exists public.runtime_queue
      drop constraint if exists runtime_queue_source_hash_fkey;
    alter table if exists public.runtime_queue
      drop constraint if exists runtime_queue_result_hash_fkey;
    alter table if exists public.process_contracts
      drop constraint if exists process_contracts_registered_hash_fkey;

    alter table public.logline_acts
      drop constraint if exists logline_acts_pkey;
    alter table public.logline_acts
      add constraint logline_acts_pkey primary key (tuple_hash);
    create index if not exists logline_acts_content_hash_idx
      on public.logline_acts(content_hash);

    alter table public.logline_acts
      drop constraint if exists receipt_version_v0;
    alter table public.logline_acts
      drop constraint if exists receipt_version_supported;
    alter table public.logline_acts
      add constraint receipt_version_supported
      check (receipt_version in ('logline.receipt.v0','logline.receipt.v1'));

    alter table public.logline_acts
      drop column if exists aux;
    alter table public.logline_acts
      add column aux jsonb generated always as (
        act
          - 'id'
          - 'receipt_version'
          - 'json_canonicalization'
          - 'hashes'
          - 'envelope'
          - 'who'
          - 'did'
          - 'this'
          - 'when'
          - 'confirmed_by'
          - 'if_ok'
          - 'if_doubt'
          - 'if_not'
          - 'status'
      ) stored;

    alter table public.logline_acts
      drop constraint if exists receipt_v1_envelope_bound;
    alter table public.logline_acts
      add constraint receipt_v1_envelope_bound check (
        receipt_version <> 'logline.receipt.v1'
        or (
          jsonb_typeof(act->'envelope') = 'object'
          and envelope_hash is not null
          and act->'hashes'->>'envelope_hash' = envelope_hash
          and envelope_hash ~ '^[0-9a-f]{64}$'
        )
      );
  `);
  await migrateLedgerRegistry(client);
}
