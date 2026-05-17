CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  context_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email_purpose_created
  ON verification_codes(email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_purpose_created
  ON verification_codes(user_id, purpose, created_at DESC);
