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

export const ensureVipDailyProfitCapColumn = async () => {
  await dbQuery(`
    ALTER TABLE vip_tiers
      ADD COLUMN IF NOT EXISTS daily_profit_cap NUMERIC(18, 2)
  `);

  await dbQuery(`
    UPDATE vip_tiers
    SET daily_profit_cap = 0.50
    WHERE id = 1
      AND daily_profit_cap IS NULL
  `);
};
