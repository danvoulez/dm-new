-- D1: proposed process types are non-authoritative drafts.
-- A type becomes executable only after a reviewed contract is present in Postgres process_contracts.
CREATE TABLE IF NOT EXISTS process_type_proposals (
  process_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  hash TEXT NOT NULL CHECK (length(hash) = 64),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS process_type_proposals_created_at_idx
  ON process_type_proposals(created_at DESC);
