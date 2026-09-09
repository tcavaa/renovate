/* eslint-disable no-console */
/**
 * Creates the secondary indexes declared in lib/db/schema.ts, idempotently.
 *
 * `drizzle-kit push` is interactive and hangs in a non-interactive shell, so index changes
 * are applied with plain DDL. Safe to re-run: existing indexes are skipped.
 */
import './lib/loadEnv';
import mysql from 'mysql2/promise';

const wanted: Array<[string, string, string]> = [
  ['products', 'products_active_category_idx', '(is_active, category_id, is_featured)'],
  ['products', 'products_model3d_kind_idx', '(model_3d_kind)'],
  ['projects', 'projects_user_created_idx', '(user_id, created_at)'],
  ['workers', 'workers_active_specialty_idx', '(is_active, specialty_slug)'],
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USER ?? 'root',
    password: process.env.DATABASE_PASSWORD ?? '',
    database: process.env.DATABASE_NAME ?? 'renovate_ge',
  });
  for (const [table, name, cols] of wanted) {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
      [table, name]
    );
    if (rows.length) { console.log(`= ${name} exists`); continue; }
    await conn.query(`CREATE INDEX ${name} ON ${table} ${cols}`);
    console.log(`+ ${name} created`);
  }
  const [all] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME t, INDEX_NAME i, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('products','projects','workers') GROUP BY TABLE_NAME, INDEX_NAME ORDER BY 1,2"
  );
  console.log(all.map((r) => `${r.t}.${r.i}(${r.c})`).join('\n'));
  await conn.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
