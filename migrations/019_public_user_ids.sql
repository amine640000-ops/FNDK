ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id TEXT;

DO $$
DECLARE
  target_user RECORD;
  generated_public_id TEXT;
BEGIN
  FOR target_user IN SELECT id FROM users WHERE public_id IS NULL LOOP
    LOOP
      generated_public_id := FLOOR(100000 + RANDOM() * 900000)::int::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE public_id = generated_public_id);
    END LOOP;

    UPDATE users
    SET public_id = generated_public_id
    WHERE id = target_user.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id);
