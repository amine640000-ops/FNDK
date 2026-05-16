ALTER TABLE ai_trading_activations
  ADD COLUMN reservation_amount NUMERIC(18, 2) NOT NULL DEFAULT 0;

INSERT INTO admin_settings (key, value) VALUES
  ('platform.reservationFailuresPerDay', '0'::jsonb)
ON CONFLICT (key) DO NOTHING;
