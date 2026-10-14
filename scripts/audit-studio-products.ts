/* eslint-disable no-console */
/**
 * Which products the design studio can really use — read-only, against the database in the
 * environment (production's, from this machine: docs/operations.md).
 *
 *   pnpm audit:studio-products                    report to stdout
 *   pnpm audit:studio-products --out report.md    and the whole report as Markdown
 *   pnpm audit:studio-products --no-files         skip the HEAD request per model and texture
 *
 * For every product with a 3D model: is it in the studio's catalogue at all (active, its shop
 * approved, a ready model, not somebody's own), does its file answer, does it have real
 * dimensions and style tags, which studio room of the shelf it shows under, what places it (the
 * furniture shelf, the technical step, the walls), whether generating a design can ever put it in
 * a flat (its kind in a room's program), and whether its name looks like its kind. For every
 * finish (a product with a texture): which surfaces it covers, whether its texture and maps
 * answer, whether it is a bathroom's (wet), and whether a style lays it when it generates.
 */
import './lib/loadEnv';
import { writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { products, stores, categories } from '../lib/db/schema';
import { loadDesignCatalog } from '../lib/api/designCatalogLoad';
import { ARCHETYPES, ROOM_PROGRAMS, isKitchenMaterial } from '../lib/design/catalog';
import { isFixtureProductKind } from '../lib/design/electrical';
import { isOpeningProductKind } from '../lib/design/openings';
import { isRadiatorProductKind } from '../lib/design/radiators';
import { isEquipmentProductKind } from '../lib/design/equipment';
import { inShelfRoom, shelfIndex } from '../lib/design/shelf';
import { styleAffinity, STYLE_IDS } from '../lib/design/styles';
import { isSurfaceProduct, styleFinishProduct, surfaceSpecs } from '../lib/design/surfaces';
import type { CatalogProduct } from '../lib/design/matcher';
import type { PlanRoom } from '../lib/design/types';
import type { RoomType } from '../lib/calculator/types';

const SITE = process.env.AUDIT_SITE ?? 'https://renovatege.vercel.app';
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const OUT = outAt >= 0 ? args[outAt + 1] : null;
const CHECK_FILES = !args.includes('--no-files');

/** Words a product's English name or slug carries for each kind of furniture — a name with none of its kind's is worth a look. */
const KIND_WORDS: Record<string, string[]> = {
  bed_double: ['bed'], bed_single: ['bed', 'daybed', 'cot'], nightstand: ['nightstand', 'bedside', 'night'],
  wardrobe: ['wardrobe', 'closet', 'armoire', 'cabinet'], dresser: ['dresser', 'chest', 'sideboard', 'drawer', 'commode', 'cabinet', 'highboard', 'credenza', 'buffet'],
  sofa_3seat: ['sofa', 'couch', 'settee'], sofa_corner: ['sofa', 'couch', 'sectional', 'corner'], armchair: ['armchair', 'chair', 'lounge', 'recliner', 'seat'],
  coffee_table: ['coffee', 'table'], tv_unit: ['tv', 'media', 'console', 'unit'], storage_shelf: ['shelf', 'rack', 'storage', 'shelving', 'unit'],
  bookshelf: ['bookshelf', 'bookcase', 'shelf', 'shelving'], dining_table: ['table'], dining_chair: ['chair', 'stool', 'bench', 'seat'],
  kitchen_run: ['kitchen'], kitchen_island: ['island', 'kitchen'], fridge: ['fridge', 'refrigerator', 'freezer', 'cooler'],
  desk: ['desk', 'table', 'workstation'], office_chair: ['chair'], toilet: ['toilet', 'wc', 'bidet', 'urinal'],
  sink: ['sink', 'basin', 'vanity', 'washbasin'], shower: ['shower'], bathtub: ['bath', 'tub'], washer: ['washer', 'washing', 'dryer', 'laundry'],
  console_table: ['console', 'table'], shoe_cabinet: ['shoe'], mirror: ['mirror'], rug: ['rug', 'carpet', 'mat'], rug_bed: ['rug', 'carpet', 'mat'],
  floor_lamp: ['lamp', 'light'], pendant: ['pendant', 'chandelier', 'lamp', 'light', 'lantern'],
  plant: ['plant', 'tree', 'pot', 'cactus', 'palm', 'flower', 'vase', 'fern', 'monstera', 'ficus', 'succulent'],
  artwork: ['art', 'print', 'poster', 'painting', 'frame', 'canvas', 'clock', 'picture', 'wall', 'decor', 'sculpture'],
  curtain: ['curtain', 'blind', 'drape'],
};

type Placement = 'furniture' | 'fitting' | 'opening' | 'radiator' | 'equipment' | 'kitchen material' | 'unknown kind';

function placementOf(p: { model3dKind: string | null; categorySlug?: string | null; unit?: string | null }): Placement {
  const kind = p.model3dKind;
  if (isKitchenMaterial({ categorySlug: p.categorySlug ?? null, unit: p.unit ?? null })) return 'kitchen material';
  if (isFixtureProductKind(kind)) return 'fitting';
  if (isOpeningProductKind(kind)) return 'opening';
  if (isRadiatorProductKind(kind)) return 'radiator';
  if (isEquipmentProductKind(kind)) return 'equipment';
  if (kind && ARCHETYPES[kind]) return 'furniture';
  return 'unknown kind';
}

/** Every kind a room's program can lay out, with the variants the program turns into (a corner sofa in a large living room, a single bed in a small bedroom). */
function programKinds(): Map<string, RoomType[]> {
  const out = new Map<string, RoomType[]>();
  const add = (kind: string, type: RoomType) => out.set(kind, [...new Set([...(out.get(kind) ?? []), type])]);
  for (const [type, program] of Object.entries(ROOM_PROGRAMS) as [RoomType, (typeof ROOM_PROGRAMS)[RoomType]][]) {
    for (const entry of program) {
      add(entry.kind, type);
      if (entry.kind === 'sofa_3seat' && entry.preferAboveM2) add('sofa_corner', type);
      if (entry.kind === 'bed_double') add('bed_single', type);
    }
  }
  return out;
}

function groupBy<T>(list: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of list) (out[key(item)] ??= []).push(item);
  return out;
}

async function answers(url: string | null | undefined): Promise<boolean | null> {
  if (!url || !CHECK_FILES) return null;
  const absolute = /^https?:\/\//.test(url) ? url : `${SITE}${url.startsWith('/') ? '' : '/'}${url}`;
  // Only "not found" is missing: a CDN under a burst of HEADs answers 429 or 5xx, which is retried.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(absolute, { method: 'HEAD' });
      if (res.ok) return true;
      if (res.status === 404 || res.status === 400) return false;
    } catch {
      /* retried below */
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  return null;
}

async function inBatches<T, R>(list: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

function room(type: RoomType): PlanRoom {
  return { id: `audit-${type}`, type, name: type, areaM2: 14, heightM: 2.7, polygon: [], openings: [] } as unknown as PlanRoom;
}

async function main() {
  const catalog = await loadDesignCatalog();
  const inCatalog = new Map(catalog.products.map((p) => [p.id, p]));
  const index = shelfIndex(catalog.shelf);
  const programs = programKinds();

  const rows = await db
    .select({ product: products, storeActive: stores.isActive, categorySlug: categories.slug })
    .from(products)
    .leftJoin(stores, eq(products.storeId, stores.id))
    .leftJoin(categories, eq(products.categoryId, categories.id));

  const lines: string[] = [];
  const say = (line = '') => {
    lines.push(line);
  };

  // ---- products with a 3D model ----
  const modelled = rows.filter((r) => r.product.model3dUrl);
  const fileOk = await inBatches(modelled, 8, (r) => answers(r.product.model3dUrl));
  const fileOf = new Map(modelled.map((r, i) => [r.product.id, fileOk[i]]));

  interface ModelRow {
    id: number;
    slug: string;
    name: string;
    kind: string | null;
    placement: Placement;
    excluded: string[];
    file: boolean | null;
    dims: boolean;
    styles: string[];
    shelfRoom: boolean;
    generated: RoomType[];
    nameOdd: boolean;
  }
  const report: ModelRow[] = modelled.map(({ product: p, storeActive, categorySlug }) => {
    const excluded: string[] = [];
    if (!p.isActive) excluded.push('inactive');
    if (p.storeId != null && storeActive === false) excluded.push('shop not approved');
    if (p.ownerUserId != null) excluded.push("a person's own");
    if (p.model3dStatus !== 'ready') excluded.push(`model ${p.model3dStatus}`);
    const studio = inCatalog.get(p.id) as CatalogProduct | undefined;
    if (!studio && excluded.length === 0) excluded.push('not in the design catalogue');
    const placement = placementOf({ model3dKind: p.model3dKind, categorySlug, unit: p.unit });
    const name = `${p.nameEn ?? ''} ${p.slug}`.toLowerCase();
    const words = p.model3dKind ? KIND_WORDS[p.model3dKind] : undefined;
    return {
      id: p.id,
      slug: p.slug,
      name: p.nameEn ?? p.nameKa,
      kind: p.model3dKind,
      placement,
      excluded,
      file: fileOf.get(p.id) ?? null,
      dims: !!(p.widthCm && p.depthCm && p.heightCm),
      styles: Array.isArray(p.styleTags) ? (p.styleTags as string[]) : [],
      shelfRoom: studio ? index.rooms.some((r) => inShelfRoom(index, studio, r.id)) : false,
      generated: placement === 'furniture' && p.model3dKind ? (programs.get(p.model3dKind) ?? []) : [],
      nameOdd: !!words && !words.some((w) => name.includes(w)),
    };
  });

  const usable = report.filter((r) => r.excluded.length === 0 && r.file !== false && r.placement !== 'unknown kind');
  const byPlacement = (list: ModelRow[]) => Object.entries(groupBy(list, (r) => r.placement)).map(([k, v]) => `${k} ${v.length}`).join(', ');
  say('# Studio product audit');
  say();
  say(`Database: ${process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, '//…@').replace(/\?.*$/, '') ?? '?'} · files checked against ${CHECK_FILES ? SITE : '(skipped)'} · ${new Date().toISOString()}`);
  say();
  say('## Products with a 3D model');
  say();
  say(`- ${modelled.length} products have a model; **${usable.length} are usable in the studio** (${byPlacement(usable)}).`);
  const excluded = report.filter((r) => r.excluded.length);
  say(`- Left out of the studio's catalogue: ${excluded.length}${excluded.length ? ` — ${Object.entries(groupBy(excluded, (r) => r.excluded.join(' + '))).map(([k, v]) => `${k} ${v.length}`).join(', ')}` : ''}.`);
  const broken = report.filter((r) => r.file === false);
  say(`- Model file missing (404): ${CHECK_FILES ? broken.length : 'not checked'}; not answering after retries: ${CHECK_FILES ? report.filter((r) => r.file === null).length : '—'}.`);
  const unknown = report.filter((r) => r.placement === 'unknown kind');
  say(`- Kind the studio does not know: ${unknown.length}.`);
  say(`- Without dimensions: ${report.filter((r) => !r.dims).length}; without style tags: ${report.filter((r) => r.styles.length === 0).length}.`);
  const furniture = usable.filter((r) => r.placement === 'furniture');
  say(`- Furniture outside every studio room of the shelf (only under "other" and in the catalogue modal): ${furniture.filter((r) => !r.shelfRoom).length}.`);
  const neverGenerated = furniture.filter((r) => r.generated.length === 0);
  say(`- Furniture whose kind no room's program lays out (placeable by hand only, never generated): ${neverGenerated.length}${neverGenerated.length ? ` — ${Object.entries(groupBy(neverGenerated, (r) => r.kind ?? '?')).map(([k, v]) => `${k} ${v.length}`).join(', ')}` : ''}.`);
  say(`- Names that do not read as their kind (worth a look): ${furniture.filter((r) => r.nameOdd).length}.`);
  say();
  say('### Furniture by kind');
  say();
  say('| Kind | Usable | Rooms that generate it | Tagged per style (modern · scandinavian · industrial · vintage) | Odd names |');
  say('|---|---|---|---|---|');
  for (const [kind, list] of Object.entries(groupBy(furniture, (r) => r.kind ?? '?')).sort((a, b) => b[1].length - a[1].length)) {
    const perStyle = STYLE_IDS.map((s) => list.filter((r) => styleAffinity(s, r.styles, null) === 2).length).join(' · ');
    say(`| ${kind} | ${list.length} | ${list[0].generated.join(', ') || '— (by hand only)'} | ${perStyle} | ${list.filter((r) => r.nameOdd).length} |`);
  }
  const other = usable.filter((r) => r.placement !== 'furniture');
  say();
  say(`Placed by other steps, not generated with the furniture: ${byPlacement(other)} — fittings (sockets, switches, lights) by the electrical layer, doors and windows on the walls, radiators and equipment by the technical step.`);
  if (broken.length || unknown.length || excluded.length) {
    say();
    say('### Not usable');
    say();
    for (const r of [...broken, ...unknown, ...excluded]) say(`- #${r.id} ${r.slug} (${r.kind ?? 'no kind'}): ${[...r.excluded, r.file === false ? 'file missing' : '', r.placement === 'unknown kind' ? 'unknown kind' : ''].filter(Boolean).join(', ')}`);
  }
  const odd = furniture.filter((r) => r.nameOdd);
  if (odd.length) {
    say();
    say('### Names that do not read as their kind');
    say();
    for (const r of odd) say(`- #${r.id} \`${r.kind}\` — ${r.name} (${r.slug})`);
  }

  // ---- finishes ----
  const textured = rows.filter((r) => r.product.textureUrl);
  const finishes = catalog.products.filter((p) => p.textureUrl);
  const texOk = await inBatches(finishes, 8, async (p) => {
    const specs = surfaceSpecs(p);
    const [tex, normal, rough] = await Promise.all([answers(p.textureUrl), answers(specs.normalUrl), answers(specs.roughnessUrl)]);
    return { tex, maps: normal !== false && rough !== false };
  });
  const roomTypes: RoomType[] = ['living_room', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'hallway', 'office', 'balcony', 'storage', 'closet'];
  const laidByStyle = new Set<number>();
  for (const style of STYLE_IDS) for (const type of roomTypes) for (const surface of ['floor', 'wall'] as const) {
    const p = styleFinishProduct(catalog.products, room(type), surface, style);
    if (p) laidByStyle.add(p.id);
  }
  const floor = finishes.filter((p) => isSurfaceProduct(p, 'floor'));
  const wall = finishes.filter((p) => isSurfaceProduct(p, 'wall'));
  const neither = finishes.filter((p) => !isSurfaceProduct(p, 'floor') && !isSurfaceProduct(p, 'wall'));
  say();
  say('## Finishes (products with a texture)');
  say();
  say(`- ${textured.length} products have a texture; ${finishes.length} are in the studio's catalogue.`);
  say(`- In the finishes tray: **${floor.length} for floors**, **${wall.length} for walls** (${finishes.filter((p) => isSurfaceProduct(p, 'floor') && isSurfaceProduct(p, 'wall')).length} for both); wet (bathroom) ones: ${finishes.filter((p) => surfaceSpecs(p).wet).length}.`);
  say(`- With a texture but no surface, so never offered: ${neither.length}${neither.length ? ` — ${neither.slice(0, 12).map((p) => p.slug).join(', ')}${neither.length > 12 ? ', …' : ''}` : ''}.`);
  say(`- Texture not answering: ${CHECK_FILES ? texOk.filter((t) => t.tex === false).length : 'not checked'}; a normal or roughness map not answering: ${CHECK_FILES ? texOk.filter((t) => !t.maps).length : 'not checked'}.`);
  say(`- Laid by a style when a design is generated (the style's look for some room): ${laidByStyle.size} of ${floor.length + wall.length - finishes.filter((p) => isSurfaceProduct(p, 'floor') && isSurfaceProduct(p, 'wall')).length}.`);
  say(`- Without style tags: ${finishes.filter((p) => !Array.isArray(p.styleTags) || (p.styleTags as unknown[]).length === 0).length}.`);
  const missingTex = finishes.filter((_, i) => texOk[i].tex === false || !texOk[i].maps);
  if (missingTex.length) {
    say();
    for (const p of missingTex) say(`- #${p.id} ${p.slug}: texture or maps missing`);
  }

  const text = lines.join('\n');
  console.log(text);
  if (OUT) await writeFile(OUT, text + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
