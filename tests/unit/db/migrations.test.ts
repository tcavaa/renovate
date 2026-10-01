import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every migration runs on MySQL 8 (local, and a hosted database later) and on MariaDB (the cPanel
 * host) — docs/data-model.md, "Migrations run on MySQL and MariaDB". These are the MySQL-only
 * forms MariaDB 10.6 and 11.4 refuse or read differently, checked on both: `CAST(… AS JSON)` and
 * `->` / `->>` do not parse, `REGEXP_LIKE` does not exist, and a back-reference in
 * REGEXP_REPLACE's replacement is text to the other engine (MySQL `$1`, MariaDB `\1`). The first
 * 0021 had two of them: it failed on the host's third statement, after its first had written
 * `$1$2.webp` into 35 finish products.
 */

const DIR = path.join(process.cwd(), 'lib', 'db', 'migrations');
const FILES = readdirSync(DIR).filter((file) => file.endsWith('.sql')).sort();

/** The SQL without its `--` comment lines (the breakpoint markers among them). */
function code(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

/** Each REGEXP_REPLACE call's arguments, split at the commas between them (quotes and parentheses respected). */
function regexpReplaceArgs(sql: string): string[][] {
  const calls: string[][] = [];
  const opening = /REGEXP_REPLACE\s*\(/gi;
  for (let m = opening.exec(sql); m; m = opening.exec(sql)) {
    const args: string[] = [];
    let start = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < sql.length; i++) {
      const c = sql[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && depth > 0) depth--;
      else if ((c === ',' && depth === 0) || c === ')') {
        args.push(sql.slice(start, i).trim());
        start = i + 1;
        if (c === ')') break;
      }
    }
    calls.push(args);
  }
  return calls;
}

/** What in this SQL would not run, or would run differently, on MariaDB. */
function mysqlOnly(sql: string): string[] {
  const body = code(sql);
  const problems: string[] = [];
  if (/\bAS\s+JSON\s*\)/i.test(body)) problems.push('CAST(… AS JSON)');
  if (/->>?\s*'\$/.test(body)) problems.push('-> / ->>');
  if (/\bREGEXP_LIKE\s*\(/i.test(body)) problems.push('REGEXP_LIKE');
  for (const args of regexpReplaceArgs(body)) {
    if (args.length >= 3 && /\$\d|\\\d/.test(args[2])) problems.push(`back-reference in REGEXP_REPLACE: ${args[2]}`);
  }
  return problems;
}

describe('migrations run on MySQL and MariaDB alike', () => {
  it('finds the MySQL-only forms', () => {
    const firstVersionOf0021 =
      "UPDATE `products` SET `specs` = CAST(REGEXP_REPLACE(CAST(`specs` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\\\.jpg', '$1$2.webp') AS JSON) WHERE `specs` -> '$.normalUrl' IS NOT NULL AND REGEXP_LIKE(`slug`, 'tile')";
    expect(mysqlOnly(firstVersionOf0021)).toEqual(['CAST(… AS JSON)', '-> / ->>', 'REGEXP_LIKE', "back-reference in REGEXP_REPLACE: '$1$2.webp'"]);
    expect(mysqlOnly("SELECT REGEXP_REPLACE(REVERSE(`a`), 'b(?=c)', '\\\\1')")).toEqual(["back-reference in REGEXP_REPLACE: '\\\\1'"]);
    // A comment may name them, and a constant replacement is fine.
    expect(mysqlOnly("-- no CAST(… AS JSON), no $1\nSELECT REGEXP_REPLACE(REVERSE(CAST(`a` AS CHAR CHARACTER SET utf8mb4)), '\"gpj[.](?=x)', '\"pbew.') WHERE `t` = '$1$2.webp'")).toEqual([]);
  });

  it.each(FILES)('%s', (file) => {
    expect(mysqlOnly(readFileSync(path.join(DIR, file), 'utf8'))).toEqual([]);
  });
});
