ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(18, 2) NOT NULL DEFAULT 0;

UPDATE transactions
SET fee_amount = ROUND((amount * 0.05)::numeric, 2)
WHERE type = 'withdrawal' AND fee_amount = 0;
