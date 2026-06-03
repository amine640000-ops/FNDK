ALTER TABLE vip_tiers
  ADD COLUMN IF NOT EXISTS daily_profit_cap NUMERIC(18, 2);

UPDATE vip_tiers
SET daily_profit_cap = 0.50
WHERE id = 1
  AND daily_profit_cap IS NULL;
