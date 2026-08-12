-- D1 projections DB — rebuildable, not authoritative. Ledger stays in Postgres.
create table if not exists projection_docs (
  projection_hash text primary key,
  projection_spec text not null,
  class text not null,
  computed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  payload json not null
);
create index if not exists projection_docs_class_idx on projection_docs(class);
