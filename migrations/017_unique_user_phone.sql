DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT translate(phone, ' ()-.', '') AS normalized_phone
      FROM users
      WHERE role = 'USER'
      GROUP BY translate(phone, ' ()-.', '')
      HAVING COUNT(*) > 1
    ) duplicate_user_phones
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique_normalized ON users (translate(phone, '' ()-.'', '''')) WHERE role = ''USER''';
  ELSE
    RAISE NOTICE 'Skipped unique phone index because duplicate USER phone numbers already exist.';
  END IF;
END $$;
