ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS release_at TIMESTAMPTZ;

UPDATE transactions
SET release_at = created_at + INTERVAL '72 hours'
WHERE type = 'withdrawal' AND release_at IS NULL;

INSERT INTO admin_settings (key, value) VALUES
  ('platform.withdrawalsPerMonthLimit', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;
