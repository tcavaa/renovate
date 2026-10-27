import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLocalDatabase, productionRefusal } from '../../../scripts/lib/productionGuard';

describe('keeping the catalogue scripts off production', () => {
  it('lets a database on this machine through and stops any other without --production', () => {
    expect(isLocalDatabase('postgresql://localhost:5432/renovate_ge')).toBe(true);
    expect(isLocalDatabase('postgres://u:p@127.0.0.1:55439/scratch')).toBe(true);
    expect(isLocalDatabase(undefined)).toBe(true);
    const supabase = 'postgresql://renovate_app.qmcdocpcrbjqgcopzcgd:secret@aws-1-eu-central-1.pooler.supabase.com:6543/postgres';
    expect(isLocalDatabase(supabase)).toBe(false);
    expect(productionRefusal('models:seed', supabase, ['node', 'seed-models.ts'])).toMatch(/--production/);
    expect(productionRefusal('models:seed', supabase, ['node', 'seed-models.ts', '--production'])).toBeNull();
    expect(productionRefusal('models:seed', 'postgresql://localhost/x', ['node', 'seed-models.ts'])).toBeNull();
  });

  it('never seeds the catalogue on a deployment', () => {
    const build = readFileSync(path.join(process.cwd(), 'scripts/vercel-build.mjs'), 'utf8');
    const code = build.split('\n').filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/models:seed|db:seed|RUN_MODELS_SEED/);
    expect(code).toMatch(/db:migrate/);
  });

  it('guards every script that rewrites products before it touches the database', () => {
    for (const [file, entry, name] of [
      ['scripts/seed-models.ts', 'async function main() {', 'models:seed'],
      ['scripts/stock-textures.ts', 'async function main() {', 'textures:stock'],
      ['scripts/seed.ts', 'async function seed() {', 'db:seed'],
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      const body = source.slice(source.indexOf(entry));
      const guard = body.indexOf(`productionRefusal('${name}'`);
      expect(guard, file).toBeGreaterThan(0);
      expect(guard, file).toBeLessThan(body.indexOf('await db.'));
    }
  });
});
