import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A Georgian word with a Cyrillic letter in the middle of it looks right in most fonts and
 * is wrong everywhere: it does not search, does not sort and does not read aloud. It gets in
 * when a string is typed next to its Russian twin. The Georgian dictionary may label the
 * Russian fields of the admin forms in Russian — "Название (Русский)" — and nothing else.
 */
describe('the Georgian dictionary', () => {
  it('has no Cyrillic letters inside Georgian words', () => {
    const source = readFileSync(join(process.cwd(), 'lib/i18n/ka.ts'), 'utf8');
    const offenders = source
      .split('\n')
      .map((line, i) => ({ line: line.replace(/Русский|Название/g, ''), number: i + 1 }))
      .filter(({ line }) => /[Ѐ-ӿ]/.test(line))
      .map(({ line, number }) => `${number}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
});
