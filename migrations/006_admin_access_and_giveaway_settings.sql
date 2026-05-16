UPDATE users
SET
  password_hash = '$2b$12$OsRJqczYzhsjaAbjdooAM.B6lNEX1zTqfva8uq.lViFzcyfNgFum6',
  email_verified_at = COALESCE(email_verified_at, NOW()),
  is_active = TRUE,
  role = 'ADMIN'
WHERE email = 'admin@fndk.capital';

INSERT INTO admin_settings (key, value) VALUES
  ('platform.maintenanceMode', 'false'::jsonb),
  ('asset.BTC.enabled', 'true'::jsonb),
  ('asset.Forex.enabled', 'true'::jsonb),
  ('platform.giveawayEnabled', 'false'::jsonb),
  ('platform.giveawayTitle', '"Weekly Investor Giveaway"'::jsonb),
  ('platform.giveawayDescription', '"Reward active investors with a configurable bonus campaign."'::jsonb),
  ('platform.giveawayPrize', '"$1,000 trading credit"'::jsonb),
  ('platform.giveawayWinners', '3'::jsonb),
  ('platform.giveawayEndsAt', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
