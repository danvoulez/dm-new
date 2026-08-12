-- Fresh Lab canonical ledger. lab_log is legacy/archive only.
create table if not exists public.logline_acts (
  content_hash text primary key check (content_hash ~ '^[0-9a-f]{64}$'),
  tuple_hash text not null check (tuple_hash ~ '^[0-9a-f]{64}$'),
  receipt_version text not null,
  act jsonb not null,
  inserted_at timestamptz not null default now(),
  envelope_hash text,
  sent_by text,
  sent_to text,
  sent_at text,
  channel text,
  who text generated always as (act->>'who') stored,
  did text generated always as (act->>'did') stored,
  this text generated always as (act->>'this') stored,
  when_slot text generated always as (act->>'when') stored,
  confirmed_by text generated always as (act->>'confirmed_by') stored,
  if_ok text generated always as (act->>'if_ok') stored,
  if_doubt text generated always as (act->>'if_doubt') stored,
  if_not text generated always as (act->>'if_not') stored,
  status text generated always as (act->>'status') stored,
  aux jsonb generated always as (act - 'id' - 'receipt_version' - 'json_canonicalization' - 'hashes' - 'who' - 'did' - 'this' - 'when' - 'confirmed_by' - 'if_ok' - 'if_doubt' - 'if_not' - 'status') stored,
  constraint id_matches_content_hash check (act->>'id' = content_hash),
  constraint tuple_hash_matches_act check (act->'hashes'->>'tuple_hash' = tuple_hash),
  constraint receipt_version_matches_act check (act->>'receipt_version' = receipt_version),
  constraint receipt_version_v0 check (receipt_version = 'logline.receipt.v0'),
  constraint no_transport_in_act check (not (act ? 'transport')),
  constraint no_result_in_act check (not (act ? 'result')),
  constraint no_evidence_in_act check (not (act ? 'evidence'))
);
create index if not exists logline_acts_if_ok_idx on public.logline_acts(if_ok);
create index if not exists logline_acts_who_idx on public.logline_acts(who);
create index if not exists logline_acts_did_idx on public.logline_acts(did);
create index if not exists logline_acts_this_idx on public.logline_acts(this);
create index if not exists logline_acts_when_idx on public.logline_acts(when_slot);
create index if not exists logline_acts_status_idx on public.logline_acts(status);

create or replace function public.prevent_logline_acts_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public.logline_acts is append-only';
end;
$$;

drop trigger if exists logline_acts_no_update on public.logline_acts;
create trigger logline_acts_no_update
before update on public.logline_acts
for each row execute function public.prevent_logline_acts_mutation();

drop trigger if exists logline_acts_no_delete on public.logline_acts;
create trigger logline_acts_no_delete
before delete on public.logline_acts
for each row execute function public.prevent_logline_acts_mutation();
