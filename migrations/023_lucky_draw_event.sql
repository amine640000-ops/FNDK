CREATE TABLE IF NOT EXISTS lucky_draw_spin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_user_id UUID NOT NULL REFERENCES users(id),
  source_user_id UUID NOT NULL REFERENCES users(id),
  source_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  spin_count INTEGER NOT NULL CHECK (spin_count > 0),
  spins_used INTEGER NOT NULL DEFAULT 0 CHECK (spins_used >= 0),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (beneficiary_user_id, source_type, source_transaction_id)
);

CREATE TABLE IF NOT EXISTS lucky_draw_spin_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  ledger_id UUID NOT NULL REFERENCES lucky_draw_spin_ledger(id),
  result_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spin_ledger_user_created
  ON lucky_draw_spin_ledger(beneficiary_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spin_results_user_created
  ON lucky_draw_spin_results(user_id, created_at DESC);

INSERT INTO admin_settings (key, value) VALUES
  ('platform.luckyDraw.enabled', 'true'::jsonb),
  ('platform.luckyDraw.title', '"Lucky Draw Event"'::jsonb),
  ('platform.luckyDraw.startsAt', '"2026-06-03T22:00:00.000Z"'::jsonb),
  ('platform.luckyDraw.endsAt', '"2026-06-08T21:59:00.000Z"'::jsonb),
  ('platform.luckyDraw.referralFirstDepositAmount', '100'::jsonb),
  ('platform.luckyDraw.referralSpinReward', '1'::jsonb),
  ('platform.luckyDraw.depositOneSpinAmount', '200'::jsonb),
  ('platform.luckyDraw.depositTwoSpinAmount', '300'::jsonb),
  (
    'platform.luckyDraw.rules',
    '[
      "Invite a direct referral who makes their first deposit of 100 USDT or more to receive 1 spin.",
      "Deposit 200 USDT or more in one transaction to receive 1 spin.",
      "Deposit 300 USDT or more in one transaction to receive 2 spins.",
      "Event period: June 4, 2026 00:00 to June 8, 2026 23:59."
    ]'::jsonb
  ),
  (
    'platform.luckyDraw.prizeLabels',
    '[
      "Lucky draw entry confirmed",
      "Bonus draw ticket recorded",
      "Campaign prize review entry",
      "VIP reward pool entry"
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
