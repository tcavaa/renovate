import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The migrations are Postgres (Supabase) — docs/data-model.md#migrations-on-postgres. These are
 * the slips a migration written from MySQL habit makes, each of which fails only when the
 * production build runs it (`scripts/vercel-build.mjs`): backticks, `FROM DUAL`, `INSERT IGNORE`,
 * `ON DUPLICATE KEY UPDATE`, session `@variables`, MySQL's `ENGINE=` / `AUTO_INCREMENT` and its
 * `CAST(… AS CHAR)` (one character in Postgres). And every file is in the journal the migrator
 * reads, in order — a file the journal does not name is never run.
 */

const DIR = path.join(process.cwd(), 'lib', 'db', 'migrations');
const FILES = readdirSync(DIR).filter((file) => file.endsWith('.sql')).sort();
const JOURNAL = JSON.parse(readFileSync(path.join(DIR, 'meta', '_journal.json'), 'utf8')) as { dialect: string; entries: Array<{ idx: number; tag: string }> };

/** The SQL without its `--` comment lines (the breakpoint markers among them) and its quoted strings. */
function code(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** What in this SQL is MySQL rather than Postgres. */
function mysqlOnly(sql: string): string[] {
  const body = code(sql);
  const problems: string[] = [];
  if (body.includes('`')) problems.push('backticks');
  if (/\bFROM\s+DUAL\b/i.test(body)) problems.push('FROM DUAL');
  if (/\bINSERT\s+IGNORE\b/i.test(body)) problems.push('INSERT IGNORE');
  if (/\bON\s+DUPLICATE\s+KEY\b/i.test(body)) problems.push('ON DUPLICATE KEY');
  if (/(^|[\s(,=])@[a-z_]+/i.test(body)) problems.push('@variables');
  if (/\bENGINE\s*=|\bAUTO_INCREMENT\b/i.test(body)) problems.push('ENGINE / AUTO_INCREMENT');
  if (/\bAS\s+CHAR\b/i.test(body)) problems.push('CAST(… AS CHAR)');
  return problems;
}

describe('migrations are Postgres', () => {
  it('finds the MySQL forms', () => {
    expect(mysqlOnly("SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'x');")).toEqual(['backticks', '@variables']);
    expect(mysqlOnly('INSERT IGNORE INTO t (a) SELECT 1 FROM DUAL ON DUPLICATE KEY UPDATE a = 1')).toEqual(['FROM DUAL', 'INSERT IGNORE', 'ON DUPLICATE KEY']);
    expect(mysqlOnly('SELECT CAST(id AS CHAR) FROM t')).toEqual(['CAST(… AS CHAR)']);
    // A comment or a string may say anything.
    expect(mysqlOnly("-- no `backticks`, no @vars\nINSERT INTO \"t\" (\"a\") VALUES ('a@b.ge `x`') ON CONFLICT DO NOTHING;")).toEqual([]);
  });

  it.each(FILES)('%s', (file) => {
    expect(mysqlOnly(readFileSync(path.join(DIR, file), 'utf8'))).toEqual([]);
  });

  it('are all in the journal, in order, for the postgresql dialect', () => {
    expect(JOURNAL.dialect).toBe('postgresql');
    expect(JOURNAL.entries.map((e) => `${e.tag}.sql`)).toEqual(FILES);
    expect(JOURNAL.entries.map((e) => e.idx)).toEqual(FILES.map((_, i) => i));
  });
});
