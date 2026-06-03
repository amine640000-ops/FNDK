import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | undefined;

const toConnectionString = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = process.env.POSTGRES_DB ?? "nevo";
  const user = process.env.POSTGRES_USER ?? "nevo";
  const password = process.env.POSTGRES_PASSWORD ?? "nevo";
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

export const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: toConnectionString()
    });
  }

  return pool;
};

export const dbQuery = async <TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<TRow>> => getPool().query<TRow>(text, params);

export const getOne = async <TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => {
  const result = await dbQuery<TRow>(text, params);
  return result.rows[0] ?? null;
};

export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const ensureVipTierRuntimeColumns = async () => {
  await dbQuery(`
    ALTER TABLE vip_tiers
      ADD COLUMN IF NOT EXISTS daily_roi_min NUMERIC(8, 6),
      ADD COLUMN IF NOT EXISTS daily_roi_max NUMERIC(8, 6),
      ADD COLUMN IF NOT EXISTS required_direct_members INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS activation_limit_per_day INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS activation_duration_minutes INTEGER NOT NULL DEFAULT 2,
      ADD COLUMN IF NOT EXISTS activation_assets JSONB NOT NULL DEFAULT '["USDT_TRC20","BTC","USD"]'::jsonb,
      ADD COLUMN IF NOT EXISTS daily_profit_cap NUMERIC(18, 2)
  `);

  await dbQuery(`
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
      ),
      required_direct_members = COALESCE(required_direct_members, 0),
      activation_limit_per_day = CASE id
        WHEN 1 THEN COALESCE(activation_limit_per_day, 3)
        WHEN 2 THEN COALESCE(activation_limit_per_day, 4)
        WHEN 3 THEN COALESCE(activation_limit_per_day, 5)
        WHEN 4 THEN COALESCE(activation_limit_per_day, 7)
        WHEN 5 THEN COALESCE(activation_limit_per_day, 10)
        ELSE COALESCE(activation_limit_per_day, 3)
      END,
      activation_duration_minutes = COALESCE(activation_duration_minutes, 2),
      activation_assets = CASE id
        WHEN 1 THEN COALESCE(activation_assets, '["USDT_TRC20","BTC","USD"]'::jsonb)
        WHEN 2 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USD"]'::jsonb)
        WHEN 3 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USD","EUR"]'::jsonb)
        WHEN 4 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USDT_ERC20","USD","EUR","GBP","STOCKS"]'::jsonb)
        WHEN 5 THEN COALESCE(activation_assets, '["BTC","ETH","USDT_TRC20","USDT_ERC20","USD","EUR","GBP","STOCKS"]'::jsonb)
        ELSE COALESCE(activation_assets, '["USDT_TRC20","BTC","USD"]'::jsonb)
      END
  `);

  await dbQuery(`
    UPDATE vip_tiers
    SET daily_profit_cap = 0.50
    WHERE id = 1
      AND daily_profit_cap IS NULL
  `);
};

export const ensureVipDailyProfitCapColumn = ensureVipTierRuntimeColumns;
