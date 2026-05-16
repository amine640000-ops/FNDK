INSERT INTO users (
  id,
  email,
  password_hash,
  full_name,
  phone,
  referral_code,
  referred_by,
  role,
  email_verified_at,
  kyc_status,
  is_active,
  created_at
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'admin@fndk.capital',
  '$2b$12$OsRJqczYzhsjaAbjdooAM.B6lNEX1zTqfva8uq.lViFzcyfNgFum6',
  'Platform Admin',
  '+12025550001',
  'FNDK-ADMIN1',
  NULL,
  'ADMIN',
  NOW(),
  'verified',
  TRUE,
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  role = 'ADMIN',
  email_verified_at = COALESCE(users.email_verified_at, NOW()),
  is_active = TRUE;
