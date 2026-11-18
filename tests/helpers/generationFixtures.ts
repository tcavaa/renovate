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
import { isKitchenMaterial, ROOM_PROGRAMS } from '../../lib/design/catalog';
import { candidatesFor, type CatalogProduct } from '../../lib/design/matcher';
import { roomEdges } from '../../lib/design/planGeometry';
import type { RoomType } from '../../lib/calculator/types';
import type { FloorPlan, SceneProduct, StyleId } from '../../lib/design/types';

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

/**
 * Real products of a kind for a unit test, from the fixture catalogue: those the matcher would
 * take for the kind (a model of exactly that kind — `candidatesFor` — not a kitchen maker's
 * material), and with a style the ones tagged with it, or every one of the kind when the style has
 * none. Their sizes and styles are the catalogue's, not a test's few products typed at the slot's
 * own size in one style.
 */
export function fixtureProducts(kind: string, styleId?: StyleId): CatalogProduct[] {
  const all = candidatesFor(kind, fixtureCatalog(), styleId ?? 'modern');
  if (!styleId) return all;
  const own = all.filter((p) => Array.isArray(p.styleTags) && p.styleTags.includes(styleId));
  return own.length > 0 ? own : all;
}

/**
 * The products of every kind a room's program lays (`ROOM_PROGRAMS`; a studio's two parts'
 * together), for a style — with the kitchen maker's materials a run and its wall cabinets are
 * made to measure in.
 */
export function fixtureProductsFor(type: RoomType, styleId?: StyleId): CatalogProduct[] {
  const program = type === 'studio' ? [...ROOM_PROGRAMS.kitchen, ...ROOM_PROGRAMS.living_room] : ROOM_PROGRAMS[type];
  const kinds = [...new Set(program.map((entry) => entry.kind))];
  const materials = kinds.includes('kitchen_run') ? fixtureCatalog().filter(isKitchenMaterial) : [];
  return [...kinds.flatMap((kind) => fixtureProducts(kind, styleId)), ...materials];
}

/** A front door (outside, 90 cm) on a room's wall: a plan drawn without its flat's front door, given one. */
function withFrontDoor(plan: FloorPlan, roomId: string, wallIndex: number, t: number): FloorPlan {
  return {
    ...plan,
    rooms: plan.rooms.map((room) =>
      room.id !== roomId ? room : { ...room, openings: [...room.openings, { id: `${roomId}-front`, roomId, kind: 'door' as const, wallIndex, t, widthM: 0.9, heightM: 2.05, sillM: 0, exterior: true }] }
    ),
  };
}

/**
 * A bathroom's door moved to the wall it shares with a bedroom: its doors (and their halves in the
 * rooms they opened into) taken out, one cut in both rooms on the shared wall instead, its middle
 * `t` along the bathroom's edge — the bathroom made the bedroom's en-suite.
 */
function withEnsuite(plan: FloorPlan, bathId: string, bedroomId: string, bathEdge: number, t: number, widthM: number): FloorPlan {
  const bath = plan.rooms.find((r) => r.id === bathId)!;
  const bedroom = plan.rooms.find((r) => r.id === bedroomId)!;
  const edge = roomEdges(bath.polygon).find((e) => e.index === bathEdge)!;
  const middle = { x: edge.a.x + edge.dir.x * t * edge.length, z: edge.a.z + edge.dir.z * t * edge.length };
  // The bedroom's face of the same wall: the edge facing it, a wall's thickness across, the door's middle on it.
  const across = roomEdges(bedroom.polygon).find((f) => {
    if (f.dir.x * edge.dir.x + f.dir.z * edge.dir.z > -0.99) return false;
    const off = (middle.x - f.a.x) * f.inward.x + (middle.z - f.a.z) * f.inward.z;
    const along = (middle.x - f.a.x) * f.dir.x + (middle.z - f.a.z) * f.dir.z;
    return off < 0 && off > -0.4 && along > widthM / 2 && along < f.length - widthM / 2;
  })!;
  const acrossT = ((middle.x - across.a.x) * across.dir.x + (middle.z - across.a.z) * across.dir.z) / across.length;
  const door = (roomId: string, wallIndex: number, at: number, to: string) => ({ id: `${roomId}-ensuite-${to}`, roomId, kind: 'door' as const, wallIndex, t: at, widthM, heightM: 2.05, sillM: 0, exterior: false, connectsToRoomId: to });
  return {
    ...plan,
    rooms: plan.rooms.map((room) => {
      const kept = room.openings.filter((o) => (room.id === bathId ? o.kind !== 'door' : !(o.kind === 'door' && o.connectsToRoomId === bathId)));
      if (room.id === bathId) return { ...room, openings: [...kept, door(bathId, bathEdge, t, bedroomId)] };
      if (room.id === bedroomId) return { ...room, openings: [...kept, door(bedroomId, across.index, acrossT, bathId)] };
      return { ...room, openings: kept };
    }),
  };
}

/**
 * Fixture plans altered so the partitions stage runs on them (docs/design-studio/generation-audit.md,
 * Q4): no plan of the team's test projects qualifies as drawn — the front door opens into a hall, or
 * the studio is under 30 m², or the bedroom under 12 m². `--import` writes them again after the
 * plans it imports, from the plans they are made from.
 */
export const ALTERED_PLANS: ReadonlyArray<{ id: string; from: string; alter: (plan: FloorPlan) => FloorPlan }> = [
  // A studio of 35 m² drawn with no front door: given one on its outside wall, it opens into the studio.
  { id: '#393+front', from: '#393', alter: (plan) => withFrontDoor(plan, 'r4', 9, 0.85) },
  // A living room of 35 m² drawn with no front door: the same.
  { id: '#394+front', from: '#394', alter: (plan) => withFrontDoor(plan, 'r5', 13, 0.85) },
  // The bathroom between the hall and a bedroom of 14.75 m², its door moved to the bedroom's wall.
  { id: '#373+ensuite', from: '#373', alter: (plan) => withEnsuite(plan, 'r2', 'r3', 1, 0.75, 0.7) },
];

/** The altered plans made from the plans given. */
export function alteredPlans(base: readonly FixturePlan[]): FixturePlan[] {
  return ALTERED_PLANS.flatMap(({ id, from, alter }) => {
    const source = base.find((p) => p.id === from);
    return source ? [{ id, plan: alter(source.plan) }] : [];
  });
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
