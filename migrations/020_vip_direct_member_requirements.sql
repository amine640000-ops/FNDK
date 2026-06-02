ALTER TABLE vip_tiers
  ADD COLUMN IF NOT EXISTS required_direct_members INTEGER NOT NULL DEFAULT 0;

UPDATE vip_tiers
SET required_direct_members = COALESCE(required_direct_members, 0);
