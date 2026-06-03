ALTER TABLE vip_tiers
  ADD COLUMN IF NOT EXISTS daily_roi_min NUMERIC(8, 6),
  ADD COLUMN IF NOT EXISTS daily_roi_max NUMERIC(8, 6),
  ADD COLUMN IF NOT EXISTS required_direct_members INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_limit_per_day INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS activation_duration_minutes INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS activation_assets JSONB NOT NULL DEFAULT '["USDT_TRC20","BTC","USD"]'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_profit_cap NUMERIC(18, 2);

UPDATE vip_tiers
SET
  daily_roi_min = COALESCE(daily_roi_min, daily_roi),
  daily_roi_max = COALESCE(
    daily_roi_max,
    CASE id
      WHEN 1 THEN 0.010000
      WHEN 2 THEN 0.015000
      WHEN 3 THEN 0.020000
      WHEN 4 THEN 0.025000
      WHEN 5 THEN 0.030000
      ELSE daily_roi
    END
  ),
  required_direct_members = COALESCE(required_direct_members, 0),
  activation_limit_per_day = CASE id
    WHEN 1 THEN COALESCE(activation_limit_per_day, 3)
    WHEN 2 THEN COALESCE(activation_limit_per_day, 4)
    WHEN 3 THEN COALESCE(activation_limit_per_day, 5)
    WHEN 4 THEN COALESCE(activation_limit_per_day, 7)
    WHEN 5 THEN COALESCE(activation_limit_per_day, 10)
    ELSE COALESCE(activation_limit_per_day, 3)
  END,
  activation_duration_minutes = COALESCE(activation_duration_minutes, 2),
  activation_assets = CASE id
    WHEN 1 THEN COALESCE(activation_assets, '["USDT_TRC20","BTC","USD"]'::jsonb)
    WHEN 2 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USD"]'::jsonb)
    WHEN 3 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USD","EUR"]'::jsonb)
    WHEN 4 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USDT_ERC20","USD","EUR","GBP","STOCKS"]'::jsonb)
    WHEN 5 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USDT_ERC20","USD","EUR","GBP","STOCKS"]'::jsonb)
    ELSE COALESCE(activation_assets, '["USDT_TRC20","BTC","USD"]'::jsonb)
  END;

UPDATE vip_tiers
SET daily_profit_cap = 0.50
WHERE id = 1
  AND daily_profit_cap IS NULL;
