ALTER TABLE lucky_draw_spin_results
  ADD COLUMN IF NOT EXISTS prize_id TEXT,
  ADD COLUMN IF NOT EXISTS reward_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_asset TEXT;

INSERT INTO admin_settings (key, value) VALUES
  (
    'platform.luckyDraw.prizes',
    '[
      {
        "id": "bonus-draw-ticket",
        "label": "Bonus draw ticket recorded",
        "chance": 35,
        "rewardAmount": 0,
        "rewardAsset": "USDT_TRC20"
      },
      {
        "id": "vip-reward-entry",
        "label": "VIP reward pool entry",
        "chance": 30,
        "rewardAmount": 0,
        "rewardAsset": "USDT_TRC20"
      },
      {
        "id": "campaign-review-entry",
        "label": "Campaign prize review entry",
        "chance": 20,
        "rewardAmount": 0,
        "rewardAsset": "USDT_TRC20"
      },
      {
        "id": "five-usdt-bonus",
        "label": "5 USDT bonus",
        "chance": 10,
        "rewardAmount": 5,
        "rewardAsset": "USDT_TRC20"
      },
      {
        "id": "twenty-usdt-bonus",
        "label": "20 USDT bonus",
        "chance": 5,
        "rewardAmount": 20,
        "rewardAsset": "USDT_TRC20"
      }
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
