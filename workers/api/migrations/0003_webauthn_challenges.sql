-- D1: short-lived, single-use WebAuthn ceremony challenges. Rebuildable/ephemeral;
-- authoritative authenticator enrollment and signoff receipts live in Postgres.
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  identity TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('enroll','sign')),
  grant_id TEXT,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1))
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_identity_kind_idx
  ON webauthn_challenges(identity, kind, used, expires_at DESC);
