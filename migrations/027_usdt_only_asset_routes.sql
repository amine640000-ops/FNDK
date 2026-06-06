INSERT INTO admin_settings (key, value) VALUES
  ('asset.BTC.enabled', 'false'::jsonb),
  ('asset.ETH.enabled', 'false'::jsonb),
  ('asset.USDT_TRC20.enabled', 'true'::jsonb),
  ('asset.USDT_ERC20.enabled', 'true'::jsonb),
  ('asset.USD.enabled', 'false'::jsonb),
  ('asset.EUR.enabled', 'false'::jsonb),
  ('asset.GBP.enabled', 'false'::jsonb),
  ('asset.STOCKS.enabled', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
