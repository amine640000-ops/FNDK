UPDATE admin_settings
SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN slide->>'id' = 'deposit-routes' AND slide->>'ctaHref' = '/app/deposit'
        THEN jsonb_set(slide, '{ctaHref}', '"/app/wallet/deposit"'::jsonb, false)
      ELSE slide
    END
    ORDER BY ordinal
  )
  FROM jsonb_array_elements(value) WITH ORDINALITY AS slides(slide, ordinal)
)
WHERE key = 'platform.adCarouselSlides'
  AND jsonb_typeof(value) = 'array';
