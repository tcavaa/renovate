/* eslint-disable no-console */
/**
 * Copies every row of the old MySQL / MariaDB database into the PostgreSQL one (Supabase), for
 * the move off cPanel (docs/operations.md#moving-the-data).
 *
 *   SOURCE_MYSQL_URL=mysql://user:pass@host:3306/renovate_ge pnpm db:copy-from-mysql --yes [--exclude-library] [--dry-run]
 *
 * The target is `DATABASE_MIGRATION_URL` (or `DATABASE_URL`) with `DATABASE_SSL*`, and must have
 * every migration applied (`pnpm db:migrate`). The copy makes the target equal to the source:
 * in one transaction it empties every table of the schema (`TRUNCATE … RESTART IDENTITY
 * CASCADE` — the starting catalogue of migration 0001 included), inserts the source's rows with
 * their ids, and moves each id sequence past the largest id — so it either all happens or none
 * of it does. `--yes` is required because of the emptying.
 *
 * Per column, by the schema's own types: MySQL's 0/1 become booleans, JSON (an object from
 * MySQL, text from MariaDB) goes in as jsonb, timestamps are read in UTC and written as
 * `timestamptz`, decimals stay strings, e-mails are lower-cased (MySQL compared them without
 * case; the app now writes and looks them up in lower case — two that only differ in case stop
 * the copy). A self-reference (a category's parent) is filled in after its table.
 *
 * `--exclude-library` leaves out the local 3D library import (products `lib-…` whose files live
 * in the untracked public/library, docs: library-3d-import): a row that points at one gets NULL
 * where the column allows it and is left out where it does not.
 *
 * The files the rows point at are a separate step (`pnpm uploads:copy-to-storage`).
 */
import './lib/loadEnv';

import mysql from 'mysql2/promise';
import { Pool, type PoolClient } from 'pg';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import * as schema from '../lib/db/schema';
import { databaseSsl, withoutSslParams } from '../lib/db/ssl';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const EXCLUDE_LIBRARY = args.has('--exclude-library');
const MAX_PARAMS = 60_000;

type Row = Record<string, unknown>;

interface TableInfo {
  table: PgTable;
  name: string;
  /** Drizzle key → column. */
  columns: Record<string, PgColumn>;
  /** Tables this one references (by SQL name), self excluded. */
  dependsOn: Set<string>;
  /** Columns that reference the table itself (filled in by an update afterwards). */
  selfRefs: string[];
  /** Column SQL name → referenced table SQL name. */
  references: Map<string, string>;
}

/** Every table of the schema, with what it references. */
function tables(): TableInfo[] {
  const out: TableInfo[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    const references = new Map<string, string>();
    const dependsOn = new Set<string>();
    const selfRefs: string[] = [];
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      const target = getTableName(ref.foreignTable);
      for (const col of ref.columns) references.set(col.name, target);
      if (target === config.name) selfRefs.push(...ref.columns.map((c) => c.name));
      else dependsOn.add(target);
    }
    out.push({ table: value, name: config.name, columns: getTableColumns(value) as Record<string, PgColumn>, dependsOn, selfRefs, references });
  }
  return out;
}

/** Parents before children. */
function ordered(all: TableInfo[]): TableInfo[] {
  const byName = new Map(all.map((t) => [t.name, t]));
  const done = new Set<string>();
  const out: TableInfo[] = [];
  const visit = (t: TableInfo, path: string[]) => {
    if (done.has(t.name)) return;
    if (path.includes(t.name)) throw new Error(`reference cycle: ${[...path, t.name].join(' → ')}`);
    for (const dep of t.dependsOn) {
      const d = byName.get(dep);
      if (d) visit(d, [...path, t.name]);
    }
    done.add(t.name);
    out.push(t);
  };
  for (const t of all) visit(t, []);
  return out;
}

function toPg(column: PgColumn, value: unknown, where: string): unknown {
  if (value === null || value === undefined) return null;
  switch (column.columnType) {
    case 'PgBoolean':
      return value === true || value === 1 || value === '1' || (Buffer.isBuffer(value) && value[0] === 1);
    case 'PgJsonb':
    case 'PgJson': {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value);
        } catch {
          throw new Error(`${where}: not JSON`);
        }
      }
      if (parsed === null) return null;
      // Postgres refuses NUL in text, JSON included.
      return JSON.stringify(parsed).replace(/\\u0000/g, '');
    }
    case 'PgTimestamp': {
      const date = value instanceof Date ? value : new Date(String(value));
      // MariaDB's zero date ("not yet" on an old host) is no date at all.
      if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1971) return null;
      return date;
    }
    case 'PgVarchar':
    case 'PgText':
    case 'PgEnumColumn':
      return String(value).replace(/\u0000/g, '');
    case 'PgNumeric':
      return String(value);
    case 'PgInteger':
      return Number(value);
    default:
      return value;
  }
}

async function main() {
  const sourceUrl = process.env.SOURCE_MYSQL_URL;
  const targetUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('SOURCE_MYSQL_URL is not set (mysql://user:pass@host:3306/database)');
  if (!targetUrl) throw new Error('DATABASE_URL (or DATABASE_MIGRATION_URL) is not set');
  if (!DRY && !args.has('--yes')) throw new Error('this empties every table of the target first: run again with --yes (or --dry-run)');

  const source = await mysql.createConnection({ uri: sourceUrl, timezone: 'Z', supportBigNumbers: true, multipleStatements: false });
  // Read every TIMESTAMP in UTC: MySQL converts them to the session's zone on the way out.
  await source.query("SET time_zone = '+00:00'");
  const target = new Pool({ connectionString: withoutSslParams(targetUrl), ssl: databaseSsl(process.env.DATABASE_SSL, process.env.DATABASE_SSL_CA), max: 1 });

  const all = ordered(tables());
  const [sourceTables] = await source.query<mysql.RowDataPacket[]>('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  const present = new Set(sourceTables.map((r) => String(r.name)));

  /** Source ids left out, per table, so rows pointing at them can be dealt with. */
  const skipped = new Map<string, Set<number>>();
  const loaded: Array<{ info: TableInfo; rows: Row[]; selfUpdates: Array<{ id: unknown; values: Row }> }> = [];

  for (const info of all) {
    if (!present.has(info.name)) {
      console.log(`  ${info.name}: not in the source — left empty`);
      loaded.push({ info, rows: [], selfUpdates: [] });
      continue;
    }
    const [raw] = await source.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${info.name}\``);
    const bySqlName = new Map(Object.values(info.columns).map((c) => [c.name, c]));
    const rows: Row[] = [];
    const selfUpdates: Array<{ id: unknown; values: Row }> = [];
    const skip = new Set<number>();
    skipped.set(info.name, skip);

    for (const r of raw) {
      if (EXCLUDE_LIBRARY && info.name === 'products' && typeof r.slug === 'string' && r.slug.startsWith('lib-')) {
        skip.add(Number(r.id));
        continue;
      }
      const row: Row = {};
      let drop = false;
      for (const [name, column] of bySqlName) {
        if (!(name in r)) continue;
        let value = toPg(column, r[name], `${info.name}.${name} (id ${String(r.id ?? '?')})`);
        if (info.name === 'users' && name === 'email' && typeof value === 'string') value = value.trim().toLowerCase();
        const refTable = info.references.get(name);
        if (refTable && value != null && skipped.get(refTable)?.has(Number(value))) {
          if (column.notNull) {
            drop = true;
            break;
          }
          value = null;
        }
        row[name] = value;
      }
      if (drop) {
        if (r.id != null) skip.add(Number(r.id));
        continue;
      }
      if (info.selfRefs.length) {
        const later: Row = {};
        for (const name of info.selfRefs) {
          if (row[name] != null) later[name] = row[name];
          row[name] = null;
        }
        if (Object.keys(later).length) selfUpdates.push({ id: row.id, values: later });
      }
      rows.push(row);
    }
    if (info.name === 'users') {
      const seen = new Map<string, unknown>();
      for (const row of rows) {
        const email = String(row.email);
        if (seen.has(email)) throw new Error(`two accounts share ${email} once case is ignored (ids ${String(seen.get(email))} and ${String(row.id)}): merge them in the source first`);
        seen.set(email, row.id);
      }
    }
    console.log(`  ${info.name}: ${rows.length} rows${skip.size ? ` (${skip.size} left out)` : ''}`);
    loaded.push({ info, rows, selfUpdates });
  }
  await source.end();

  if (DRY) {
    console.log('dry run: nothing written');
    await target.end();
    return;
  }

  const client: PoolClient = await target.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE TABLE ${all.map((t) => `"${t.name}"`).join(', ')} RESTART IDENTITY CASCADE`);
    for (const { info, rows } of loaded) {
      if (!rows.length) continue;
      const names = Object.keys(rows[0]);
      const perBatch = Math.max(1, Math.min(500, Math.floor(MAX_PARAMS / names.length)));
      for (let i = 0; i < rows.length; i += perBatch) {
        const batch = rows.slice(i, i + perBatch);
        const params: unknown[] = [];
        const tuples = batch.map((row) => `(${names.map((n) => (params.push(row[n]), `$${params.length}`)).join(', ')})`);
        await client.query(`INSERT INTO "${info.name}" (${names.map((n) => `"${n}"`).join(', ')}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(', ')}`, params);
      }
    }
    for (const { info, selfUpdates } of loaded) {
      for (const { id, values } of selfUpdates) {
        const names = Object.keys(values);
        await client.query(`UPDATE "${info.name}" SET ${names.map((n, i) => `"${n}" = $${i + 1}`).join(', ')} WHERE "id" = $${names.length + 1}`, [...names.map((n) => values[n]), id]);
      }
    }
    // Each identity sequence past the largest id copied, so the next insert does not collide.
    for (const { info } of loaded) {
      const idColumn = Object.values(info.columns).find((c) => c.name === 'id');
      if (!idColumn || idColumn.columnType !== 'PgInteger') continue;
      await client.query(`SELECT setval(pg_get_serial_sequence('"${info.name}"', 'id'), GREATEST(COALESCE(MAX("id"), 0), 1), MAX("id") IS NOT NULL) FROM "${info.name}"`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // What arrived, table by table, against what was read.
  let mismatches = 0;
  for (const { info, rows } of loaded) {
    const { rows: [counted] } = await target.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${info.name}"`);
    if (counted.n !== rows.length) {
      mismatches++;
      console.error(`  ✗ ${info.name}: ${counted.n} in the target, ${rows.length} copied`);
    }
  }
  await target.end();
  if (mismatches) throw new Error(`${mismatches} tables do not match`);
  console.log('✅ copied: the target now holds the source\'s rows');
}

main().catch((err) => {
  console.error('❌ copy failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
