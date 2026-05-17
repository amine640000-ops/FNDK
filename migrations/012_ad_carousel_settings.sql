INSERT INTO admin_settings (key, value) VALUES
  (
    'platform.adCarouselSlides',
    '[
      {
        "id": "mission-rewards",
        "enabled": true,
        "eyebrow": "Direct invitation rewards",
        "title": "Invite. Upgrade. Unlock.",
        "description": "Complete mission tiers, trigger AI tasks, and stack daily USDT campaign bonuses.",
        "ctaLabel": "Open Mission Center",
        "ctaHref": "/app/mission",
        "imageUrl": ""
      },
      {
        "id": "vip-growth",
        "enabled": true,
        "eyebrow": "VIP trading access",
        "title": "Grow with active plans.",
        "description": "Use deposits to unlock higher VIP tiers, stronger daily ROI ranges, and better task limits.",
        "ctaLabel": "View VIP Levels",
        "ctaHref": "/app/vip",
        "imageUrl": ""
      },
      {
        "id": "deposit-routes",
        "enabled": true,
        "eyebrow": "Fast account funding",
        "title": "Top up and start.",
        "description": "Deposit with crypto, bank instructions, or internal ledger routes configured by FNDK admin.",
        "ctaLabel": "Deposit Funds",
        "ctaHref": "/app/wallet/deposit",
        "imageUrl": ""
      }
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
