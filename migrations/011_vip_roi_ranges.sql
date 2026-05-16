ALTER TABLE vip_tiers
  ADD COLUMN IF NOT EXISTS daily_roi_min NUMERIC(8, 6),
  ADD COLUMN IF NOT EXISTS daily_roi_max NUMERIC(8, 6);

UPDATE vip_tiers
SET
  daily_roi_min = COALESCE(daily_roi_min, daily_roi),
  daily_roi_max = COALESCE(
    daily_roi_max,
    CASE id
      WHEN 1 THEN 0.010000
      WHEN 2 THEN 0.015000
      WHEN 3 THEN 0.020000
      WHEN 4 THEN 0.025000
      WHEN 5 THEN 0.030000
      ELSE daily_roi
    END
  );

ALTER TABLE vip_tiers
  ALTER COLUMN daily_roi_min SET NOT NULL,
  ALTER COLUMN daily_roi_max SET NOT NULL;

UPDATE vip_tiers
SET daily_roi = daily_roi_max
WHERE daily_roi <> daily_roi_max;
