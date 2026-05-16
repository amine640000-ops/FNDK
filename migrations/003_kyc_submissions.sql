CREATE TABLE kyc_submissions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  document_type TEXT,
  document_url TEXT NOT NULL,
  selfie_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_kyc_submissions_user_submitted_at
  ON kyc_submissions(user_id, submitted_at DESC);

CREATE INDEX idx_kyc_submissions_status_submitted_at
  ON kyc_submissions(status, submitted_at DESC);
