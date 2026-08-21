-- LogLine receipt v1: preserve v0 history, mint new rows with content/envelope identity split.
--
-- v1 law:
--   content_hash  = H(JCS(LogLine 9 + AUX))
--   envelope_hash = H(JCS(envelope))
--   tuple_hash    = H(content_hash + envelope_hash)
--
-- Hash calculation remains application/kernel responsibility; these constraints ensure
-- the persisted row and self-describing receipt agree without rewriting v0 history.

alter table public.logline_acts
  drop constraint if exists receipt_version_v0;

alter table public.logline_acts
  drop constraint if exists receipt_version_supported;

alter table public.logline_acts
  add constraint receipt_version_supported
  check (receipt_version in ('logline.receipt.v0','logline.receipt.v1'));

-- In v1 envelope is part of the universal unit but not AUX/content hash material.
-- Rebuild the generated projection so search/projections do not accidentally treat
-- process/custody context as semantic AUX.
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
