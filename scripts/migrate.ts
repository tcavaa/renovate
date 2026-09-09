/* eslint-disable no-console */
/**
 * Applies pending migrations from lib/db/migrations.
 *
 *   pnpm db:migrate              apply everything not yet applied
 *   pnpm db:migrate --baseline   mark every existing migration as applied without running it
 *
 * `--baseline` is for a database that was created with `drizzle-kit push` before migrations
 * existed (every environment before September 2026): the tables are already there, so the
 * initial migration must be recorded, not executed. Run it once per such database; from then
 * on plain `db:migrate` is the only thing deploy/deploy.sh calls.
 *
 * `drizzle-kit push` stays available for local schema experiments and nothing else.
 */
import './lib/loadEnv';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db, pool } from '../lib/db';

const MIGRATIONS = path.join(process.cwd(), 'lib', 'db', 'migrations');
const TABLE = '__drizzle_migrations';

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

async function baseline(): Promise<void> {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`
  );
  const [rows] = await pool.query<import('mysql2').RowDataPacket[]>(`SELECT created_at FROM \`${TABLE}\``);
  const applied = new Set(rows.map((r) => Number(r.created_at)));

  for (const entry of journal.entries) {
    if (applied.has(entry.when)) {
      console.log(`= ${entry.tag} already recorded`);
      continue;
    }
    // Same hash drizzle's migrator would compute, so it recognises the row as its own.
    const sqlText = readFileSync(path.join(MIGRATIONS, `${entry.tag}.sql`), 'utf8');
    const hash = createHash('sha256').update(sqlText).digest('hex');
    await pool.query(`INSERT INTO \`${TABLE}\` (hash, created_at) VALUES (?, ?)`, [hash, entry.when]);
    console.log(`+ ${entry.tag} recorded as applied (baseline)`);
  }
}

async function main() {
  if (process.argv.includes('--baseline')) {
    await baseline();
  } else {
    await migrate(db, { migrationsFolder: MIGRATIONS });
    console.log('✅ migrations up to date');
  }
  await pool.end();
}

main().catch((err) => {
  console.error('❌ migration failed:', err);
  process.exit(1);
});
