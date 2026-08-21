-- LogLine receipt v1: preserve v0 history, mint new rows with content/envelope identity split.
--
-- v1 law:
--   content_hash  = H(JCS(LogLine 9 + AUX))
--   envelope_hash = H(JCS(envelope))
--   tuple_hash    = H(content_hash + envelope_hash)
--
-- `tuple_hash` is the unique ledger occurrence/unit. `content_hash` is semantic identity
-- and is intentionally non-unique: the same semantic Act may rest in more than one
-- process/envelope context without one registration erasing the other.

-- Old projections used content_hash as an FK target. That forced semantic identity to be
-- unique and therefore contradicted the v1 split. These are rebuildable/projection-side
-- relationships; objective hash existence is enforced by the kernel at admission time.
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

-- In v1 envelope is part of the universal unit but not AUX/content hash material.
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

comment on column public.logline_acts.content_hash is
  'Semantic LogLine identity (9 fields + AUX); non-unique by design in receipt v1.';
comment on column public.logline_acts.tuple_hash is
  'Unique ledger occurrence: H(content_hash + envelope_hash) in receipt v1.';
