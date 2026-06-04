CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created
  ON admin_activity_log(created_at DESC);

ALTER TABLE lucky_draw_spin_ledger
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_note TEXT;

ALTER TABLE lucky_draw_spin_results
  ADD COLUMN IF NOT EXISTS prize_index INTEGER,
  ADD COLUMN IF NOT EXISTS roll_value INTEGER,
  ADD COLUMN IF NOT EXISTS roll_max INTEGER,
  ADD COLUMN IF NOT EXISTS weight_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prize_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reward_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reward_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spin_ledger_available
  ON lucky_draw_spin_ledger(beneficiary_user_id, created_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spin_results_prize_status
  ON lucky_draw_spin_results(prize_id, reward_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spin_results_reward_transaction
  ON lucky_draw_spin_results(reward_transaction_id)
  WHERE reward_transaction_id IS NOT NULL;

UPDATE lucky_draw_spin_results
SET reward_status = CASE
  WHEN reward_amount > 0 AND reward_status = 'none' THEN 'credited'
  ELSE reward_status
END;

INSERT INTO admin_settings (key, value) VALUES
  ('platform.luckyDraw.maxTotalRewardAmount', '500'::jsonb),
  ('platform.luckyDraw.maxRewardPerUserAmount', '50'::jsonb),
  ('platform.luckyDraw.instantRewardMaxAmount', '10'::jsonb),
  ('platform.luckyDraw.requireKycAboveAmount', '10'::jsonb),
  ('platform.luckyDraw.showPrizeChancesToUsers', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (filename)
SELECT filename
FROM (VALUES
  ('001_init.sql'),
  ('002_seed_admin.sql'),
  ('003_kyc_submissions.sql'),
  ('004_ai_trading_activations.sql'),
  ('005_seed_ai_trading_activations.sql'),
  ('006_admin_access_and_giveaway_settings.sql'),
  ('007_remove_dummy_data.sql'),
  ('008_withdrawal_rules.sql'),
  ('009_withdrawal_fee.sql'),
  ('010_reservation_controls.sql'),
  ('011_vip_roi_ranges.sql'),
  ('012_ad_carousel_settings.sql'),
  ('013_asset_route_settings.sql'),
  ('014_verification_codes.sql'),
  ('015_fix_deposit_carousel_cta.sql'),
  ('016_security_passcode_and_mission_tasks.sql'),
  ('017_unique_user_phone.sql'),
  ('018_kyc_real_name_fields.sql'),
  ('019_public_user_ids.sql'),
  ('020_vip_direct_member_requirements.sql'),
  ('021_vip_daily_profit_cap.sql'),
  ('022_ensure_vip_runtime_columns.sql'),
  ('023_lucky_draw_event.sql'),
  ('024_lucky_draw_weighted_prizes.sql'),
  ('025_lucky_draw_controls_and_audit.sql')
) AS migrations(filename)
ON CONFLICT (filename) DO NOTHING;
