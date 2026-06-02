CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by UUID,
  role TEXT NOT NULL DEFAULT 'USER',
  email_verified_at TIMESTAMPTZ,
  kyc_status TEXT NOT NULL DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  asset_type TEXT NOT NULL,
  balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  active_investment NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, asset_type)
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  fee_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  proof_url TEXT,
  destination_address TEXT,
  release_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vip_tiers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  min_deposit NUMERIC(18, 2) NOT NULL,
  daily_roi NUMERIC(8, 6) NOT NULL,
  required_direct_members INTEGER NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE user_vip (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tier_id INTEGER NOT NULL REFERENCES vip_tiers(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trade_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  asset TEXT NOT NULL,
  strategy TEXT NOT NULL,
  entry_price NUMERIC(18, 4) NOT NULL,
  exit_price NUMERIC(18, 4) NOT NULL,
  profit NUMERIC(18, 2) NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE referrals (
  id UUID PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES users(id),
  referred_id UUID NOT NULL REFERENCES users(id),
  bonus_amount NUMERIC(18, 2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO vip_tiers (id, name, min_deposit, daily_roi, required_direct_members, features) VALUES
  (1, 'Starter', 50, 0.005, 0, '["Basic AI trading","Standard support"]'::jsonb),
  (2, 'Silver', 500, 0.01, 0, '["Priority support","Weekly reports"]'::jsonb),
  (3, 'Gold', 2000, 0.015, 0, '["Dedicated account manager","Daily reports"]'::jsonb),
  (4, 'Platinum', 10000, 0.02, 0, '["Advanced AI strategies","Instant withdrawals"]'::jsonb),
  (5, 'Diamond', 50000, 0.025, 0, '["All assets","Custom AI strategy","VIP concierge"]'::jsonb);

INSERT INTO admin_settings (key, value) VALUES
  ('platform.name', '"FNDK"'::jsonb),
  ('platform.referralBonusPercent', '5'::jsonb),
  ('platform.feePercent', '20'::jsonb),
  ('platform.autoProfitDistribution', 'true'::jsonb),
  ('platform.withdrawalsPerMonthLimit', '3'::jsonb),
  ('platform.reservationFailuresPerDay', '0'::jsonb);

CREATE INDEX idx_transactions_user_type_status ON transactions(user_id, type, status);
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_notifications_user_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX idx_user_vip_user_assigned_at ON user_vip(user_id, assigned_at DESC);
