#!/usr/bin/env node
/**
 * Applies pending migrations from lib/db/migrations with plain node — no tsx, no dev
 * dependencies. This is what deploy/cpanel.sh runs in release mode, where the checkout holds
 * only the standalone server CI built; `mysql2` is loaded from that server's node_modules
 * (next.config.mjs lists it in serverExternalPackages so the build ships it).
 *
 * It does exactly what drizzle-orm's mysql2 migrator does, so the two can be used
 * interchangeably on the same database: same `__drizzle_migrations` table, same sha256 of
 * the whole .sql file as the hash, and a migration counts as pending when its journal
 * timestamp is newer than the last recorded one. Statements are split on drizzle's
 * `--> statement-breakpoint` marker.
 *
 *   node deploy/migrate.cjs            apply everything pending
 *   NEXT_DIST_DIR=.next-build node deploy/migrate.cjs   (a build made beside the dev server)
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { loadEnvFiles } = require('./lib/env.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = process.env.NEXT_DIST_DIR || '.next';
const MIGRATIONS = path.join(ROOT, 'lib', 'db', 'migrations');
const TABLE = '__drizzle_migrations';

function requireMysql2() {
  const bases = [ROOT, path.join(ROOT, DIST, 'standalone')];
  for (const base of bases) {
    const modules = path.join(base, 'node_modules');
    // A hoisted or symlinked layout: node_modules/mysql2 resolves directly.
    try {
      return createRequire(modules + path.sep)('mysql2/promise');
    } catch (e) {
      if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
    }
    // pnpm's layout, which output file tracing copies as-is: the real package lives under
    // node_modules/.pnpm/mysql2@<version>/node_modules/mysql2, its dependencies beside it.
    const store = path.join(modules, '.pnpm');
    if (fs.existsSync(store)) {
      const entry = fs.readdirSync(store).find((name) => name.startsWith('mysql2@'));
      if (entry) return require(path.join(store, entry, 'node_modules', 'mysql2', 'promise.js'));
    }
  }
  throw new Error(`mysql2 not found under ${bases.map((b) => path.join(b, 'node_modules')).join(' or ')}`);
}

function readMigrations() {
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'));
  return journal.entries.map((entry) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, `${entry.tag}.sql`), 'utf8');
    return {
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash('sha256').update(sql).digest('hex'),
      statements: sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean),
    };
  });
}

async function main() {
  loadEnvFiles(ROOT);
  const mysql = requireMysql2();
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'renovate_ge',
    multipleStatements: false,
  });
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`
    );
    const [rows] = await conn.query(`SELECT created_at FROM \`${TABLE}\` ORDER BY created_at DESC LIMIT 1`);
    const last = rows.length ? Number(rows[0].created_at) : 0;
    let applied = 0;
    for (const m of readMigrations()) {
      if (m.when <= last) continue;
      console.log(`+ ${m.tag}`);
      for (const statement of m.statements) await conn.query(statement);
      await conn.query(`INSERT INTO \`${TABLE}\` (hash, created_at) VALUES (?, ?)`, [m.hash, m.when]);
      applied++;
    }
    console.log(applied ? `✅ ${applied} migration(s) applied` : '✅ migrations up to date');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('❌ migration failed:', err);
  process.exit(1);
});
