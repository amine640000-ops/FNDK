ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS bonus_type TEXT NOT NULL DEFAULT 'deposit_bonus',
  ADD COLUMN IF NOT EXISTS generation INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bonus_percent NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

UPDATE referrals
SET bonus_type = 'deposit_bonus'
WHERE bonus_type IS NULL OR bonus_type = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_commission_source
  ON referrals (referrer_id, referred_id, bonus_type, generation, source_reference)
  WHERE source_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_type_paid_at
  ON referrals (referrer_id, bonus_type, paid_at DESC);
