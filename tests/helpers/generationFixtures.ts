/**
 * Real plans and the real catalogue, saved small, for generating whole flats in tests and in
 * `pnpm audit:generation` (docs/design-studio/generation-audit.md): `tests/fixtures/generation/`
 * holds the design catalogue as the generator reads it (a product's name, kind, sizes, style and
 * price — no shop, no picture) and the plans of the team's test projects (their geometry and
 * technical points — no names, no upload, no products on their doors and windows).
 *
 * The small flat in `tests/helpers/generation.ts` has two doorless rooms and fourteen products at
 * the slots' own sizes; nothing generation gets wrong shows on it. These do.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { samplePlan } from '../../lib/design/samplePlan';
import { ensureWalls } from '../../lib/design/walls';
import type { CatalogProduct } from '../../lib/design/matcher';
import type { FloorPlan, SceneProduct } from '../../lib/design/types';

export const GENERATION_FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'generation');

/** The host a `~` at the head of a saved URL stands for: no real one — nothing is fetched. */
const STORAGE = 'https://storage.test';
const MARK = '~';

export interface FixturePlan {
  /** `sample`, or the project the plan was taken from (`#412`). */
  id: string;
  plan: FloorPlan;
}

type SlimProduct = Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'nameKa' | 'slug' | 'categorySlug' | 'pricePerUnit' | 'unit'>;

/** What a product in a flat does not need to be generated: who sells it, how it is pictured. */
const DROPPED_FIELDS = new Set(['nameRu', 'brand', 'categoryId', 'imageUrl', 'store', 'own', 'pending']);
const DROPPED_SPECS = new Set(['triangles', 'source', 'license']);

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

/** A catalogue product as the fixture keeps it: empty fields left out, the storage's address shortened to `~`. */
export function slimProduct(product: CatalogProduct, base: string | null): SlimProduct {
  const shorten = (s: string) => (base && s.startsWith(base) ? MARK + s.slice(base.length) : s);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(product)) {
    if (value === null || value === undefined || value === false || DROPPED_FIELDS.has(key)) continue;
    if (key === 'specs' && typeof value === 'object') {
      const specs = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k, v]) => v !== null && !DROPPED_SPECS.has(k)));
      if (Object.keys(specs).length > 0) out.specs = mapStrings(specs, shorten);
      continue;
    }
    out[key] = mapStrings(value, shorten);
  }
  return out as SlimProduct;
}

function fullProduct(slim: SlimProduct): CatalogProduct {
  const expand = (s: string) => (s.startsWith(MARK) ? STORAGE + s.slice(MARK.length) : s);
  return {
    nameEn: null,
    nameRu: null,
    brand: null,
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dKind: null,
    model3dUrl: null,
    widthCm: null,
    depthCm: null,
    heightCm: null,
    styleTags: null,
    tags: null,
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...(mapStrings(slim, expand) as SlimProduct),
  };
}

const slimSceneProduct = (product: SceneProduct | null | undefined): SceneProduct | null | undefined =>
  product ? { ...product, nameEn: null, nameRu: null, brand: null, imageUrl: null, store: null } : product;

/** A plan as the fixture keeps it: its rooms, walls, openings and technical points, and nothing that says whose it is. */
export function slimPlan(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    imageUrl: null,
    rooms: plan.rooms.map((room) => ({
      ...room,
      name: room.id,
      // A door or a window with no product is given the style's, as on a new plan.
      openings: room.openings.map(({ product: _product, ...opening }) => opening),
    })),
    technical: plan.technical ? { ...plan.technical, points: plan.technical.points.map((p) => ({ ...p, note: undefined, product: slimSceneProduct(p.product), cabinet: slimSceneProduct(p.cabinet) })) } : plan.technical,
  };
}

let catalog: CatalogProduct[] | null = null;
let plans: FixturePlan[] | null = null;

/** The design catalogue as it was when the fixture was saved (`pnpm audit:generation --refresh-catalog`). */
export function fixtureCatalog(): CatalogProduct[] {
  if (!catalog) {
    const saved = JSON.parse(readFileSync(path.join(GENERATION_FIXTURES_DIR, 'catalog.json'), 'utf8')) as { products: SlimProduct[] };
    catalog = saved.products.map(fullProduct);
  }
  return catalog;
}

/** The app's sample flat and the saved plans, each with its walls. */
export function fixturePlans(): FixturePlan[] {
  if (!plans) {
    const saved = JSON.parse(readFileSync(path.join(GENERATION_FIXTURES_DIR, 'plans.json'), 'utf8')) as { plans: FixturePlan[] };
    plans = [{ id: 'sample', plan: ensureWalls(samplePlan()) }, ...saved.plans.map(({ id, plan }) => ({ id, plan: ensureWalls(plan) }))];
  }
  return plans;
}

/** The two files as text: one product, one plan a line, so a refresh reads as a diff. */
export function catalogFixtureText(products: CatalogProduct[], base: string | null): string {
  return `{"products":[\n${products.map((p) => JSON.stringify(slimProduct(p, base))).join(',\n')}\n]}\n`;
}

export function plansFixtureText(list: FixturePlan[]): string {
  return `{"plans":[\n${list.map(({ id, plan }) => JSON.stringify({ id, plan: slimPlan(plan) })).join(',\n')}\n]}\n`;
}
