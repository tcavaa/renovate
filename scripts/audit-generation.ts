/* eslint-disable no-console */
/**
 * What generating a flat really produces — the generator run over real plans with the real
 * catalogue (the fixtures in tests/fixtures/generation), every style, several draws, and each
 * finished flat checked as a whole (`lib/design/sceneAudit`): what rooms end without, what no rule
 * allows, which of the app's own rule checks its flats fail. No database and no API key.
 * docs/design-studio/generation-audit.md is what the numbers were first taken for.
 *
 *   pnpm audit:generation                       every fixture plan × 4 styles × 3 draws
 *   pnpm audit:generation --seeds 9             more draws of each
 *   pnpm audit:generation --only '#412,#408'    some plans only
 *   pnpm audit:generation --examples            with where to look (plan/style/draw room: what)
 *   pnpm audit:generation --flat '#412/modern/1' [--room r2]   one flat: its rooms, pieces and what is wrong
 *   pnpm audit:generation --write-baseline      record what the invariants test holds generation to
 *                                               (refused when anything got worse; --allow-worse to record it anyway)
 *   pnpm audit:generation --refresh-catalog     save the catalogue of the database in the environment as the fixture
 *   pnpm audit:generation --import <dir>        write both fixtures from <dir>/catalog.json and <dir>/plans.json
 *                                               (and the altered plans made from those, `ALTERED_PLANS`)
 *   pnpm audit:generation --alter               make the altered plans again from the saved ones
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { roomEdges } from '../lib/design/planGeometry';
import { STYLE_IDS } from '../lib/design/styles';
import { auditScene, issueMetric } from '../lib/design/sceneAudit';
import type { CatalogProduct } from '../lib/design/matcher';
import type { FloorPlan, PlacedItem, PlanRoom, StyleId } from '../lib/design/types';
import { compareWithBaseline, generatedFlat, measureGeneration, sortedCounts, type GenerationBaseline } from '../tests/helpers/generationAudit';
import { ALTERED_PLANS, alteredPlans, catalogFixtureText, fixtureCatalog, fixturePlans, GENERATION_FIXTURES_DIR, plansFixtureText, type FixturePlan } from '../tests/helpers/generationFixtures';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const BASELINE = path.join(GENERATION_FIXTURES_DIR, 'baseline.json');
/** Draws per plan and style the invariants test generates: one, so it stays a few seconds. */
const BASELINE_SEEDS = 1;
/** The smallest flat taken for a fixture: under it the drawing was not to scale. */
const MIN_FLAT_M2 = 40;

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b === 0 ? '' : `${Math.round((a / b) * 100)}%`);

function storageBase(products: CatalogProduct[]): string | null {
  for (const p of products) {
    const match = /^(https?:\/\/[^/]+\/storage\/v1\/object\/public)\//.exec(p.model3dUrl ?? '');
    if (match) return match[1];
  }
  return null;
}

function writeCatalog(products: CatalogProduct[]) {
  const file = path.join(GENERATION_FIXTURES_DIR, 'catalog.json');
  writeFileSync(file, catalogFixtureText(products, storageBase(products)));
  console.log(`${products.length} products → ${path.relative(process.cwd(), file)}`);
}

/** The plans file: the plans given, then the altered plans made from them (`ALTERED_PLANS`). */
function writePlans(plans: FixturePlan[]) {
  const altered = alteredPlans(plans);
  const file = path.join(GENERATION_FIXTURES_DIR, 'plans.json');
  writeFileSync(file, plansFixtureText([...plans, ...altered]));
  console.log(`${plans.length} plans and ${altered.length} altered → ${path.relative(process.cwd(), file)}`);
}

function importFixtures(dir: string) {
  writeCatalog(JSON.parse(readFileSync(path.join(dir, 'catalog.json'), 'utf8')) as CatalogProduct[]);
  const stored = JSON.parse(readFileSync(path.join(dir, 'plans.json'), 'utf8')) as Array<{ id: number; plan: FloorPlan }>;
  writePlans(stored.filter((p) => p.plan.rooms.reduce((sum, r) => sum + r.areaM2, 0) >= MIN_FLAT_M2).map((p) => ({ id: `#${p.id}`, plan: p.plan })));
}

/** The altered plans made again from the saved plans they come from (after a change to `ALTERED_PLANS`). */
function alterFixtures() {
  const saved = JSON.parse(readFileSync(path.join(GENERATION_FIXTURES_DIR, 'plans.json'), 'utf8')) as { plans: FixturePlan[] };
  const ids = new Set(ALTERED_PLANS.map((a) => a.id));
  writePlans(saved.plans.filter((p) => !ids.has(p.id)));
}

async function refreshCatalog() {
  await import('./lib/loadEnv');
  const { loadDesignCatalog } = await import('../lib/api/designCatalogLoad');
  writeCatalog((await loadDesignCatalog()).products);
}

function describeRoom(room: PlanRoom): string {
  const xs = room.polygon.map((p) => p.x);
  const zs = room.polygon.map((p) => p.z);
  const lines = [`${room.id} ${room.type} ${r2(room.areaM2)} m², ${r2(Math.max(...xs) - Math.min(...xs))} × ${r2(Math.max(...zs) - Math.min(...zs))} m, ${room.polygon.length} corners${room.open?.length ? `, open edges ${room.open.join(',')}` : ''}`];
  for (const edge of roomEdges(room.polygon)) {
    const openings = room.openings.filter((o) => o.wallIndex === edge.index).map((o) => `${o.kind}${o.exterior ? ' (outside)' : ''} at ${r2(o.t * edge.length)} m, ${r2(o.widthM)} wide`);
    lines.push(`    wall ${edge.index}: ${r2(edge.length)} m${openings.length ? ` — ${openings.join('; ')}` : ''}`);
  }
  return lines.join('\n');
}

const describeItem = (i: PlacedItem) =>
  `${i.id} [${i.kind}] at (${r2(i.position.x)}, ${r2(i.position.z)}) turned ${Math.round((i.rotation * 180) / Math.PI)}°, ${r2(i.size.width)} × ${r2(i.size.depth)} × ${r2(i.size.height)}${i.elevationM ? `, ${r2(i.elevationM)} up` : ''}${i.areaM ? `, tray ${i.areaM.width} × ${i.areaM.depth}` : ''} — ${i.product ? `#${i.product.productId} ${i.product.nameEn ?? i.product.nameKa}` : 'no product'}`;

function showFlat(name: string, roomId: string | null) {
  const [planId, styleId, n] = name.split('/');
  const entry = fixturePlans().find((p) => p.id === planId);
  if (!entry || !STYLE_IDS.includes(styleId as StyleId) || !Number(n)) throw new Error(`no flat "${name}": plan/style/draw, e.g. '#412/modern/1' (plans: ${fixturePlans().map((p) => p.id).join(' ')})`);
  const scene = generatedFlat(entry.id, entry.plan, fixtureCatalog(), styleId as StyleId, Number(n));
  const issues = auditScene(scene);
  for (const room of scene.plan.rooms) {
    if (roomId && room.id !== roomId) continue;
    console.log(`\n${describeRoom(room)}`);
    for (const item of scene.items.filter((i) => i.roomId === room.id)) console.log(`  ${describeItem(item)}`);
    for (const d of scene.decor.filter((p) => p.roomId === room.id)) console.log(`  ${d.id} [${d.family}${d.anchor ? `:${d.anchor}` : ''}] wall ${d.wallIndex}, ${r2(d.span.from)}–${r2(d.span.to)} m along, ${r2(d.height.from)}–${r2(d.height.to)} m up`);
    for (const issue of issues.filter((i) => i.roomId === room.id)) console.log(`  ! ${issueMetric(issue)} — ${issue.what}${issue.itemId ? ` (${issue.itemId})` : ''}`);
  }
  for (const issue of issues.filter((i) => i.roomId === null)) console.log(`\n! ${issueMetric(issue)} — ${issue.what}`);
}

function report(seeds: number, only: Set<string> | null) {
  const plans = fixturePlans().filter((p) => !only || only.has(p.id));
  const catalog = fixtureCatalog();
  const started = Date.now();
  const first: Record<string, number> = {};
  const measure = measureGeneration(plans, catalog, seeds, (run, _scene, issues) => {
    if (run.n > BASELINE_SEEDS) return;
    for (const issue of issues) first[issueMetric(issue)] = (first[issueMetric(issue)] ?? 0) + 1;
  });
  console.log(`${plans.length} plans × ${STYLE_IDS.length} styles × ${seeds} draws = ${measure.flats} flats, ${catalog.length} products, ${Math.round((Date.now() - started) / measure.flats)} ms a flat`);

  const counts = sortedCounts(measure.counts);
  const rows = (title: string, pick: (metric: string) => boolean, line: (metric: string, n: number) => string) => {
    const list = Object.entries(counts).filter(([metric]) => pick(metric));
    if (list.length === 0) return;
    console.log(`\n${title}`);
    for (const [metric, n] of list.sort((a, b) => b[1] - a[1])) {
      console.log(line(metric, n));
      if (flag('--examples')) for (const example of measure.examples[metric] ?? []) console.log(`        ${example}`);
    }
  };
  rows('What the rooms end without (of the rooms of that type)', (m) => m.startsWith('missing:'), (m, n) => {
    const type = m.split(':')[1];
    const of = type === 'flat' ? measure.flats : measure.rooms[type] ?? 0;
    return `  ${String(n).padStart(5)}  ${m.slice('missing:'.length).padEnd(34)} of ${of}  ${pct(n, of)}`;
  });
  rows('What no rule allows (a flat)', (m) => !m.startsWith('missing:') && !m.startsWith('rule:'), (m, n) => `  ${String(n).padStart(5)}  ${m.padEnd(34)} ${r2(n / measure.flats)}`);
  rows("The app's own rule checks on its own flats (a flat)", (m) => m.startsWith('rule:'), (m, n) => `  ${String(n).padStart(5)}  ${m.slice('rule:'.length).padEnd(34)} ${r2(n / measure.flats)}`);

  if (only) return;
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as GenerationBaseline;
  const moved = compareWithBaseline(first, baseline.counts);
  if (flag('--write-baseline')) {
    if (moved.worse.length > 0 && !flag('--allow-worse')) {
      console.log(`\nNot recorded — worse than the baseline:\n  ${moved.worse.join('\n  ')}\nFix it, or record it knowingly with --allow-worse.`);
      process.exitCode = 1;
      return;
    }
    const rooms: Record<string, number> = {};
    for (const [type, n] of Object.entries(measure.rooms)) rooms[type] = Math.round((n / seeds) * BASELINE_SEEDS);
    const next: GenerationBaseline = { seeds: BASELINE_SEEDS, flats: (measure.flats / seeds) * BASELINE_SEEDS, rooms, counts: sortedCounts(first) };
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nBaseline recorded (${next.flats} flats): ${moved.better.length} better, ${moved.worse.length} worse.`);
  } else {
    console.log(`\nAgainst the baseline (the first draw of each): ${moved.worse.length} worse, ${moved.better.length} better.`);
  }
  for (const line of moved.worse) console.log(`  worse   ${line}`);
  for (const line of moved.better) console.log(`  better  ${line}`);
}

async function main() {
  const dir = value('--import');
  if (dir) return importFixtures(dir);
  if (flag('--alter')) return alterFixtures();
  if (flag('--refresh-catalog')) return refreshCatalog();
  const flat = value('--flat');
  if (flat) return showFlat(flat, value('--room'));
  const only = value('--only');
  report(Math.max(1, Number(value('--seeds') ?? 3)), only ? new Set(only.split(',')) : null);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
