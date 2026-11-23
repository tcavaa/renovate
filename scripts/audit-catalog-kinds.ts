/* eslint-disable no-console */
/**
 * The catalogue products the team should check in admin: every product whose sizes cannot be its
 * kind, or whose name says it is another kind (`lib/design/plausibility.ts` `KIND_BOUNDS` — the
 * owner's decision 9). Read-only, from the generation fixture's catalogue (tests/fixtures/generation
 * — `pnpm audit:generation --refresh-catalog` saves a fresh one from the database); no database, no
 * key, nothing written but the report.
 *
 *   pnpm audit:catalog-kinds                       the report as Markdown to stdout
 *   pnpm audit:catalog-kinds --out report.md       to a file
 *   pnpm audit:catalog-kinds --catalog <file.json> another saved catalogue ({ products } or an array)
 *
 * Each row says whether generation already refuses the product (it stays in the catalogue and the
 * swap list) or only lists it, and why.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { KIND_BOUNDS, kindProblems } from '../lib/design/plausibility';
import type { CatalogProduct } from '../lib/design/matcher';
import { fixtureCatalog } from '../tests/helpers/generationFixtures';

const args = process.argv.slice(2);
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

function loadCatalog(): CatalogProduct[] {
  const file = value('--catalog');
  if (!file) return fixtureCatalog();
  const raw = JSON.parse(readFileSync(file, 'utf8')) as CatalogProduct[] | { products: CatalogProduct[] };
  return Array.isArray(raw) ? raw : raw.products;
}

const size = (cm: number | null | undefined) => (cm != null && cm > 0 ? String(cm) : '—');
const cell = (text: string) => text.replace(/\|/g, '\\|');

const catalog = loadCatalog();
const rows = catalog
  .filter((p) => p.model3dKind && KIND_BOUNDS[p.model3dKind])
  .map((p) => ({ product: p, ...kindProblems(p) }))
  .filter((r) => r.refused.length > 0 || r.listed.length > 0)
  .sort((a, b) => a.product.model3dKind!.localeCompare(b.product.model3dKind!) || a.product.id - b.product.id);

const lines: string[] = [
  '# Catalogue products to check',
  '',
  `${rows.length} of ${catalog.length} products fail their kind's bounds (\`lib/design/plausibility.ts\`): sizes that cannot be the kind, or a name that says another kind. Correct the kind or the sizes in admin, or remove the product. **Refused**: generation never places it (it stays in the catalogue and the studio's swap list); **listed**: generation still may, until the catalogue has the products to replace it.`,
  '',
];
for (const kind of [...new Set(rows.map((r) => r.product.model3dKind!))]) {
  const of = rows.filter((r) => r.product.model3dKind === kind);
  lines.push(`## ${kind} (${of.length})`, '', '| id | name | W × D × H cm | generation | why |', '|---|---|---|---|---|');
  for (const { product: p, refused, listed } of of) {
    lines.push(`| ${p.id} | ${cell(p.nameEn || p.nameKa)} | ${size(p.widthCm)} × ${size(p.depthCm)} × ${size(p.heightCm)} | ${refused.length > 0 ? 'refused' : 'listed'} | ${cell([...refused, ...listed].join('; '))} |`);
  }
  lines.push('');
}
const report = lines.join('\n');
const out = value('--out');
if (out) {
  writeFileSync(out, report);
  console.log(`${rows.length} products → ${out}`);
} else {
  console.log(report);
}
