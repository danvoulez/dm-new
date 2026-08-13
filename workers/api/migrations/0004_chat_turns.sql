-- D1: conversational projection only. The ledger remains authoritative in Postgres.
CREATE TABLE IF NOT EXISTS chat_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  message TEXT NOT NULL,
  action_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_turns_conversation_idx
  ON chat_turns(conversation_id, created_at, id);
