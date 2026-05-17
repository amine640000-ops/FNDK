ALTER TABLE users
  ADD COLUMN IF NOT EXISTS security_passcode_hash TEXT;

CREATE TABLE IF NOT EXISTS mission_task_claims (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  task_id TEXT NOT NULL,
  reward_amount NUMERIC(18, 2) NOT NULL,
  reward_asset TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_task_claims_user_id
  ON mission_task_claims(user_id);

INSERT INTO admin_settings (key, value)
VALUES (
  'platform.missionTasks',
  '[
    {
      "id": "direct-invites-2",
      "enabled": true,
      "category": "limited",
      "title": "Invite 2 first-line members",
      "description": "Complete direct invitation task phase 1.",
      "target": 2,
      "rewardAmount": 20,
      "rewardAsset": "USDT_TRC20"
    },
    {
      "id": "direct-invites-3",
      "enabled": true,
      "category": "limited",
      "title": "Invite 3 first-line members",
      "description": "Complete direct invitation task phase 2.",
      "target": 3,
      "rewardAmount": 60,
      "rewardAsset": "USDT_TRC20"
    },
    {
      "id": "direct-invites-10",
      "enabled": true,
      "category": "daily",
      "title": "Invite 10 first-line members",
      "description": "Complete direct invitation task phase 3.",
      "target": 10,
      "rewardAmount": 150,
      "rewardAsset": "USDT_TRC20"
    },
    {
      "id": "direct-invites-20",
      "enabled": true,
      "category": "long-term",
      "title": "Invite 20 first-line members",
      "description": "Complete direct invitation task phase 4.",
      "target": 20,
      "rewardAmount": 300,
      "rewardAsset": "USDT_TRC20"
    }
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
