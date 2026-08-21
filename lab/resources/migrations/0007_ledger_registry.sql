-- Ledger-native registry projections for LogLine v1.2.
--
-- Source of truth is public.logline_acts. YAML/process_contracts remain bootstrap/import
-- compatibility only; runtime discovery reads these pure projections.

create or replace view public.current_process_types as
with definitions as (
  select
    content_hash as registered_hash,
    tuple_hash,
    act->>'this' as process_id,
    act->>'who' as defined_by,
    act->>'when' as defined_when,
    act->>'status' as status,
    act->'definition' as definition,
    act->>'supersedes' as supersedes,
    act->>'source_yml' as source_yml,
    inserted_at
  from public.logline_acts
  where did = 'defined_process_type'
    and coalesce(act->>'this','') <> ''
    and jsonb_typeof(act->'definition') = 'object'
), unsuperseded as (
  select d.*
  from definitions d
  where not exists (
    select 1 from definitions newer
    where newer.supersedes = d.registered_hash
  )
), ranked as (
  select *, row_number() over (
    partition by process_id
    order by inserted_at desc, tuple_hash desc
  ) as rn
  from unsuperseded
)
select
  process_id,
  registered_hash,
  tuple_hash,
  definition,
  supersedes,
  status,
  defined_by,
  defined_when,
  source_yml,
  inserted_at
from ranked
where rn = 1;

create or replace view public.current_vocabulary as
with ranked as (
  select
    content_hash as definition_hash,
    tuple_hash,
    act->'definition'->>'domain' as domain,
    act->'definition'->>'term' as term,
    act->'definition'->>'meaning' as meaning,
    act->'definition'->>'outcome' as outcome,
    act->>'who' as defined_by,
    act->>'when' as defined_when,
    act->>'status' as status,
    act->'definition' as definition,
    inserted_at,
    row_number() over (
      partition by act->'definition'->>'domain', act->'definition'->>'term'
      order by inserted_at desc, tuple_hash desc
    ) as rn
  from public.logline_acts
  where did = 'defined_vocabulary_term'
    and jsonb_typeof(act->'definition') = 'object'
    and coalesce(act->'definition'->>'domain','') <> ''
    and coalesce(act->'definition'->>'term','') <> ''
)
select
  domain,
  term,
  meaning,
  outcome,
  definition_hash,
  tuple_hash,
  definition,
  status,
  defined_by,
  defined_when,
  inserted_at
from ranked
where rn = 1;

comment on view public.current_process_types is
  'Pure projection of unsuperseded defined_process_type Acts; old hashes remain in the ledger.';
comment on view public.current_vocabulary is
  'Pure projection of latest defined_vocabulary_term Act per domain/term.';
