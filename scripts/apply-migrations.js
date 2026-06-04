const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "migrations");

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

const main = async () => {
  const client = new Client({ connectionString: toConnectionString() });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    const appliedResult = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    if (!applied.size) {
      const legacy = await client.query("SELECT to_regclass('public.users') AS users_table");
      if (legacy.rows[0]?.users_table) {
        const legacyFiles = files.filter((file) => file < "025_lucky_draw_controls_and_audit.sql");
        for (const file of legacyFiles) {
          await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
            [file]
          );
          applied.add(file);
        }
      }
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [file]
        );
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
