import { describe, expect, it } from 'vitest';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { itemFootprints } from '@/lib/design/manipulate';
import { refreshRoom } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import type { PlacedItem, PlanRoom, StyleId } from '@/lib/design/types';

/**
 * The big pieces are the style's own (K-15, Y-7) — with a way out when none of the style's fits
 * its slot (docs/design-studio/generation-audit.md, M2 and RB2): a smaller piece of the style,
 * then the nearest other style's that fits; never an empty slot with the room arranged round it.
 */

function product(id: number, kind: string, widthCm: number, depthCm: number, styleTags: string[], patch: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    nameKa: `p${id}`,
    slug: `p${id}`,
    brand: null,
    categorySlug: 'sofas',
    pricePerUnit: 1200,
    unit: 'piece',
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dKind: kind,
    model3dUrl: `/models/p${id}.glb`,
    widthCm,
    depthCm,
    heightCm: 85,
    styleTags,
    tags: [],
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...patch,
  };
}

const rect = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });

/** A slot with its back on the room's north wall (z = 0), its middle `x` along it. */
function slot(id: string, roomId: string, kind: string, slotName: PlacedItem['slot'], x: number, size: PlacedItem['size']): PlacedItem {
  return { id, roomId, slot: slotName, kind, position: { x, z: size.depth / 2 }, rotation: 0, elevationM: 0, size, product: null };
}

const CORNER = { width: 2.7, depth: 1.75, height: 0.84 };
const living = rect('living', 'living_room', 4, 6);
const cornerSlot = () => slot('sofa', 'living', 'sofa_corner', 'sofa', 2, CORNER);
/** Vintage's only corner sofa, as the catalogue has it: 4.17 × 3.47 m, wider than any wall it is laid on. */
const hugeVintageCorner = product(1, 'sofa_corner', 417, 347, ['vintage']);

const match = (items: PlacedItem[], catalog: CatalogProduct[], styleId: StyleId, rooms: PlanRoom[], seed?: number) =>
  matchProducts(items, catalog, { styleId, rooms, ...(seed == null ? {} : { rng: seededRng(seed) }) });

describe('a corner sofa slot none of the style\'s corner sofas fits', () => {
  it('takes a three-seat of the style before any other style\'s corner sofa', () => {
    const catalog = [hugeVintageCorner, product(2, 'sofa_3seat', 210, 92, ['vintage']), product(3, 'sofa_corner', 270, 175, ['modern'])];
    for (const seed of [undefined, 1, 2, 3]) {
      const [sofa] = match([cornerSlot()], catalog, 'vintage', [living], seed);
      expect(sofa.product?.productId).toBe(2);
      // It is a three-seat now, in the sofa's slot: its label, its swap list and its floor are a three-seat's.
      expect(sofa.kind).toBe('sofa_3seat');
      expect(sofa.slot).toBe('sofa');
      expect(sofa.size).toEqual({ width: 2.1, depth: 0.92, height: 0.85 });
      // Its back on the wall the corner sofa's slot had its back on, in the middle of the slot.
      expect(sofa.position.x).toBeCloseTo(2);
      expect(sofa.position.z - sofa.size.depth / 2).toBeCloseTo(0);
      expect(itemFootprints(sofa)).toHaveLength(1);
    }
  });

  it('with no three-seat of the style that fits, takes another style\'s corner sofa — the nearest style first', () => {
    const tooWide = product(2, 'sofa_3seat', 520, 92, ['vintage']);
    const kindred = product(3, 'sofa_corner', 270, 175, ['industrial'], { tags: ['retro'] });
    const stranger = product(4, 'sofa_corner', 265, 170, ['modern']);
    for (const seed of [undefined, 1, 2, 3]) {
      const [sofa] = match([cornerSlot()], [hugeVintageCorner, tooWide, stranger, kindred], 'vintage', [living], seed);
      expect(sofa.product?.productId).toBe(3);
      expect(sofa.kind).toBe('sofa_corner');
    }
    // …and one with no tie to the style at all when that is all that fits.
    const [sofa] = match([cornerSlot()], [hugeVintageCorner, tooWide, stranger], 'vintage', [living]);
    expect(sofa.product?.productId).toBe(4);
  });

  it('last, another style\'s three-seat', () => {
    const catalog = [hugeVintageCorner, product(5, 'sofa_corner', 430, 300, ['modern']), product(6, 'sofa_3seat', 220, 95, ['modern'])];
    const [sofa] = match([cornerSlot()], catalog, 'vintage', [living]);
    expect(sofa.product?.productId).toBe(6);
    expect(sofa.kind).toBe('sofa_3seat');
  });

  it('stays empty only when nothing at all fits', () => {
    const [sofa] = match([cornerSlot()], [hugeVintageCorner, product(5, 'sofa_3seat', 560, 95, ['modern'])], 'vintage', [living]);
    expect(sofa.product).toBeNull();
    expect(sofa.kind).toBe('sofa_corner');
  });

  it('measures the coffee table off the three-seat that took the slot', () => {
    const table: PlacedItem = { ...slot('table', 'living', 'coffee_table', 'coffee_table', 2, { width: 1.1, depth: 0.6, height: 0.42 }), position: { x: 2, z: 1.75 + 0.42 + 0.3 } };
    const catalog = [hugeVintageCorner, product(2, 'sofa_3seat', 210, 92, ['vintage']), product(7, 'coffee_table', 110, 60, ['vintage'], { categorySlug: 'tables' })];
    const [sofa, coffee] = match([cornerSlot(), table], catalog, 'vintage', [living]);
    expect(sofa.kind).toBe('sofa_3seat');
    // 42 cm of floor between the real sofa's front and the table.
    expect(coffee.position.z - coffee.size.depth / 2 - (sofa.position.z + sofa.size.depth / 2)).toBeCloseTo(0.42);
  });
});

describe('a double bed slot none of the style\'s doubles fits', () => {
  // The bed's slot on the north wall and the wardrobe's 5 cm off it, as the engine lays them: what
  // is not matched yet stands in the way at its archetype's size, so a bed over 1.7 m is refused (RB2).
  const bedroom = rect('bed', 'bedroom', 4.2, 4);
  const bedSlot = () => slot('bed', 'bed', 'bed_double', 'bed', 1.5, { width: 1.6, depth: 2.05, height: 1.05 });
  const wardrobeSlot = () => slot('wardrobe', 'bed', 'wardrobe', 'wardrobe', 3.25, { width: 1.8, depth: 0.62, height: 2.25 });
  const wideModern = product(11, 'bed_double', 240, 215, ['modern'], { categorySlug: 'beds' });
  const wardrobe = product(19, 'wardrobe', 180, 62, ['modern'], { categorySlug: 'wardrobes', heightCm: 225 });

  it('takes another style\'s double that fits, never a single', () => {
    const single = product(12, 'bed_single', 95, 200, ['modern'], { categorySlug: 'beds' });
    const other = product(13, 'bed_double', 160, 205, ['scandinavian'], { categorySlug: 'beds' });
    for (const seed of [undefined, 1, 2]) {
      const [bed] = match([bedSlot(), wardrobeSlot()], [wideModern, single, other, wardrobe], 'modern', [bedroom], seed);
      expect(bed.product?.productId).toBe(13);
      expect(bed.kind).toBe('bed_double');
    }
    const [none] = match([bedSlot(), wardrobeSlot()], [wideModern, single, wardrobe], 'modern', [bedroom]);
    expect(none.product).toBeNull();
    // Not even where the catalogue has no double at all.
    expect(match([bedSlot(), wardrobeSlot()], [single, wardrobe], 'modern', [bedroom])[0].product).toBeNull();
  });

  it('keeps the style\'s own wherever one fits', () => {
    const own = product(14, 'bed_double', 165, 205, ['modern'], { categorySlug: 'beds' });
    const other = product(13, 'bed_double', 160, 205, ['scandinavian'], { categorySlug: 'beds' });
    for (const seed of [undefined, 1, 2, 3, 4, 5]) {
      const [bed] = match([bedSlot(), wardrobeSlot()], [wideModern, other, own, wardrobe], 'modern', [bedroom], seed);
      expect(bed.product?.productId).toBe(14);
    }
  });
});

describe('the Scandinavian flat keeps black out of the way out too', () => {
  it('takes a light piece of another style before a black one', () => {
    const black = product(21, 'sofa_corner', 270, 175, ['modern'], { colorHex: '#111111' });
    const light = product(22, 'sofa_corner', 268, 172, ['modern'], { colorHex: '#e8e2d6' });
    const ownHuge = product(23, 'sofa_corner', 417, 347, ['scandinavian'], { colorHex: '#e8e2d6' });
    for (const seed of [undefined, 1, 2, 3, 4]) {
      const [sofa] = match([cornerSlot()], [ownHuge, black, light], 'scandinavian', [living], seed);
      expect(sofa.product?.productId).toBe(22);
    }
  });
});

describe('a kind the catalogue has no product of', () => {
  // The bedroom's rug is laid as `rug_bed` (under the bed); the catalogue's rugs are all `rug` (M6).
  const bedroom = rect('bed', 'bedroom', 4, 4);
  const bedSlot = () => slot('bed', 'bed', 'bed_double', 'bed', 2, { width: 1.6, depth: 2.05, height: 1 });
  const bed = product(40, 'bed_double', 160, 205, ['modern'], { categorySlug: 'beds', heightCm: 100 });
  const rugSlot = (): PlacedItem => ({ id: 'rug', roomId: 'bed', slot: 'rug', kind: 'rug_bed', position: { x: 2, z: 1.6 }, rotation: 0, elevationM: 0, size: { width: 2.6, depth: 2, height: 0.02 }, product: null });
  const rug = (id: number) => product(id, 'rug', 200, 140, ['modern'], { categorySlug: 'rugs', heightCm: 2 });

  it('that is another kind\'s product laid in a place of its own takes that kind\'s: the bedroom\'s rug is a rug', () => {
    for (const seed of [undefined, 1, 2]) {
      const [, placed] = match([bedSlot(), rugSlot()], [bed, rug(41)], 'modern', [bedroom], seed);
      expect(placed.product?.productId).toBe(41);
      // A rug now, where the bedroom's rug was laid and at the size it was laid.
      expect(placed.kind).toBe('rug');
      expect(placed.slot).toBe('rug');
      expect(placed.size).toEqual({ width: 2.6, depth: 2, height: 0.02 });
      expect(placed.position).toEqual({ x: 2, z: 1.6 });
    }
  });

  it('keeps to its own products where it has any', () => {
    const own = product(42, 'rug_bed', 260, 200, ['modern'], { categorySlug: 'rugs', heightCm: 2 });
    for (const seed of [undefined, 1, 2, 3, 4, 5, 6]) {
      const [, placed] = match([bedSlot(), rugSlot()], [bed, rug(41), own], 'modern', [bedroom], seed);
      expect(placed.product?.productId).toBe(42);
      expect(placed.kind).toBe('rug_bed');
    }
  });

  it('stays empty where no other kind fills its slot (the hall\'s shoe cabinet)', () => {
    const shoes: PlacedItem = slot('shoes', 'bed', 'shoe_cabinet', 'shoe_cabinet', 2, { width: 0.9, depth: 0.36, height: 0.62 });
    const [placed] = match([shoes], [rug(41), product(43, 'dresser', 90, 36, ['modern'])], 'modern', [bedroom]);
    expect(placed.product).toBeNull();
    expect(placed.kind).toBe('shoe_cabinet');
  });

  it('stays empty where the kinds that fill its slot are not the same thing', () => {
    // A blind's slot is the curtain's, sized to its window: a curtain would be squeezed to a blind's 59 cm.
    const blind: PlacedItem = { id: 'blind', roomId: 'bed', slot: 'curtain', kind: 'blind', position: { x: 2, z: 0.03 }, rotation: 0, elevationM: 1.81, size: { width: 1.5, depth: 0.06, height: 0.59 }, product: null };
    const curtain = product(47, 'curtain', 300, 12, ['modern'], { categorySlug: 'decor', heightCm: 260 });
    // A single bed's slot is not a double's (nor a double's a single's), an open shelf's not a bookcase's.
    const single = slot('single', 'bed', 'bed_single', 'bed', 3.4, { width: 0.95, depth: 2.05, height: 0.9 });
    const shelf = slot('shelf', 'bed', 'storage_shelf', 'bookshelf', 1, { width: 0.9, depth: 0.4, height: 1.9 });
    const bookcase = product(48, 'bookshelf', 90, 35, ['modern'], { categorySlug: 'storage', heightCm: 190 });
    // The living room's rug is not given the bedroom's either.
    const livingRug: PlacedItem = { ...rugSlot(), id: 'living-rug', roomId: 'living', kind: 'rug' };
    const bedside = product(49, 'rug_bed', 260, 200, ['modern'], { categorySlug: 'rugs', heightCm: 2 });
    for (const seed of [undefined, 1, 2]) {
      const placed = match([blind, single, shelf, livingRug], [curtain, bed, bookcase, bedside], 'modern', [bedroom, living], seed);
      expect(placed.map((item) => item.product)).toEqual([null, null, null, null]);
      expect(placed.map((item) => item.kind)).toEqual(['blind', 'bed_single', 'storage_shelf', 'rug']);
    }
  });

  it('draws nothing from the flat\'s draw: the pieces matched after it are the ones they were', () => {
    const sofas = [product(51, 'sofa_3seat', 200, 90, ['modern']), product(52, 'sofa_3seat', 205, 92, ['modern']), product(53, 'sofa_3seat', 210, 95, ['modern']), product(54, 'sofa_3seat', 198, 88, ['modern'])];
    const sofa = () => slot('sofa', 'living', 'sofa_3seat', 'sofa', 2, { width: 2.2, depth: 0.92, height: 0.84 });
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const withRug = match([bedSlot(), rugSlot(), sofa()], [...sofas, bed, rug(41), rug(44), rug(45)], 'modern', [bedroom, living], seed);
      const without = match([bedSlot(), rugSlot(), sofa()], [...sofas, bed], 'modern', [bedroom, living], seed);
      expect(withRug[1].product).not.toBeNull();
      expect(withRug[2].product?.productId).toBe(without[2].product?.productId);
    }
  });
});
