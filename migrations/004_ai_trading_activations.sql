ALTER TABLE vip_tiers
  ADD COLUMN activation_limit_per_day INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN activation_duration_minutes INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN activation_assets JSONB NOT NULL DEFAULT '["USDT_TRC20","BTC","USD"]'::jsonb;

UPDATE vip_tiers
SET
  activation_limit_per_day = CASE id
    WHEN 1 THEN 3
    WHEN 2 THEN 4
    WHEN 3 THEN 5
    WHEN 4 THEN 7
    WHEN 5 THEN 10
  END,
  activation_duration_minutes = 2,
  activation_assets = CASE id
    WHEN 1 THEN '["USDT_TRC20","BTC","USD"]'::jsonb
    WHEN 2 THEN '["BTC","ETH","USDT_TRC20","USD"]'::jsonb
    WHEN 3 THEN '["BTC","ETH","USDT_TRC20","USD","EUR"]'::jsonb
    WHEN 4 THEN '["BTC","ETH","USDT_TRC20","USDT_ERC20","USD","EUR","GBP","STOCKS"]'::jsonb
    WHEN 5 THEN '["BTC","ETH","USDT_TRC20","USDT_ERC20","USD","EUR","GBP","STOCKS"]'::jsonb
  END;

CREATE TABLE ai_trading_activations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tier_id INTEGER NOT NULL REFERENCES vip_tiers(id),
  asset TEXT NOT NULL,
  strategy TEXT NOT NULL,
  market_summary TEXT NOT NULL,
  thesis TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  duration_minutes INTEGER NOT NULL,
  daily_slot_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  entry_price NUMERIC(18, 4),
  exit_price NUMERIC(18, 4),
  profit NUMERIC(18, 2)
);

CREATE INDEX idx_ai_trading_activations_user_started_at
  ON ai_trading_activations(user_id, started_at DESC);

CREATE INDEX idx_ai_trading_activations_user_status
  ON ai_trading_activations(user_id, status);
