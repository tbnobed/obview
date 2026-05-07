/**
 * Schema drift guard. Compares every column declared in shared/schema.ts
 * against the live database (information_schema.columns). Exits non-zero if
 * any expected column is missing — meaning a `migrations/*.sql` file was
 * forgotten when shared/schema.ts was edited.
 *
 * Wired into:
 *   - scripts/docker-entrypoint.sh   → blocks prod startup on drift
 *   - server/index.ts startup        → blocks dev startup on drift
 *
 * Extra columns in the DB are ignored (legacy columns, not-yet-removed fields).
 */
import { Pool } from "pg";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[verify-schema] DATABASE_URL not set; skipping drift check.");
    process.exit(0);
  }

  const expected: { table: string; column: string }[] = [];
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object") continue;
    // PgTable instances have a Symbol-keyed config; getTableConfig accepts them.
    try {
      const cfg = getTableConfig(value as PgTable);
      for (const col of cfg.columns) {
        expected.push({ table: cfg.name, column: col.name });
      }
    } catch {
      // Not a table export (zod schema, type, etc.) — skip silently.
    }
  }

  const useSsl = /sslmode=require/.test(url) || /neon\.tech/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  const tables = Array.from(new Set(expected.map((e) => e.table)));
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [tables],
  );
  await pool.end();

  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = expected.filter((e) => !present.has(`${e.table}.${e.column}`));

  if (missing.length === 0) {
    console.log(`[verify-schema] OK — ${expected.length} columns across ${tables.length} tables.`);
    process.exit(0);
  }

  console.error("\n❌ [verify-schema] Schema drift detected. The following columns are declared in shared/schema.ts but missing from the database:\n");
  const byTable = new Map<string, string[]>();
  for (const m of missing) {
    if (!byTable.has(m.table)) byTable.set(m.table, []);
    byTable.get(m.table)!.push(m.column);
  }
  for (const [t, cols] of byTable) {
    console.error(`  ${t}:`);
    for (const c of cols) console.error(`    - ${c}`);
  }
  console.error("\nFix: write a new migrations/NNNN_*.sql with `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <c> ...;`");
  console.error("Then redeploy (prod) or run `psql $DATABASE_URL -f migrations/NNNN_*.sql` (dev).\n");
  process.exit(1);
}

main().catch((err) => {
  console.error("[verify-schema] Unexpected error:", err);
  process.exit(1);
});
