import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import { PAINT_COLORS, STYLE_IDS, getStyle, paintLook, type PaintName } from '@/lib/design/styles';
import { defaultFinish, finishFromProduct, generatedFinish, isStyleFinish, styleFinish, styleFinishProduct, withStyleFinishes } from '@/lib/design/surfaces';
import { defaultFinishes } from '@/lib/design/generateScene';
import { seededRng } from '@/lib/design/random';
import { isBaseFinish } from '@/lib/design/zones';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlanRoom, SurfaceFinish } from '@/lib/design/types';

/**
 * The style's own floors and walls are partner products: the product whose texture the style
 * lays, so the flat is generated in things that can be bought and the budget buys them.
 */

const look = getStyle('modern').surfaces;

const surfaceProduct = (id: number, textureUrl: string, surfaces: Array<'floor' | 'wall'>, extra: { wet?: boolean; price?: number; styleTags?: string[] } = {}): CatalogProduct =>
  ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: 'floor-tiles', pricePerUnit: extra.price ?? 30, unit: 'm2', imageUrl: null, colorHex: null, textureUrl, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: extra.styleTags ?? ['modern'], tags: [], isFeatured: false, specs: { surfaces, wet: !!extra.wet, textureScaleM: 1.4 }, coveragePerUnit: null, store: null }) as CatalogProduct;

const laminate = surfaceProduct(1, look.floor.textureUrl!, ['floor']);
// Cheaper and as modern as the style's own: ranked first on the shelf, but not what the style shows.
const cheaperLaminate = surfaceProduct(2, '/textures/other-wood.webp', ['floor'], { price: 10, styleTags: ['modern', 'minimalist'] });
const floorTiles = surfaceProduct(3, look.wetFloor.textureUrl!, ['floor', 'wall'], { wet: true, price: 40 });
const wallTiles = surfaceProduct(4, look.wetWall.textureUrl!, ['wall'], { wet: true, price: 35 });
// The same file served from elsewhere, as an uploaded texture may be.
const plaster = surfaceProduct(5, `https://cdn.remonti.ge${look.wall.textureUrl}?v=2`, ['wall'], { price: 16 });
const otherWetFloor = surfaceProduct(6, '/textures/other-tile.webp', ['floor'], { wet: true, price: 20 });
const sofa = { ...surfaceProduct(7, '', []), textureUrl: null, specs: null, categorySlug: 'sofas' } as CatalogProduct;
const catalog = [cheaperLaminate, laminate, otherWetFloor, floorTiles, wallTiles, plaster, sofa];

const room = (id: string, type: PlanRoom['type'], w = 4, d = 3): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.5, areaM2: 0, perimeterM: 0, openings: [] });
const bedroom = room('bed', 'bedroom');
const bathroom = room('bath', 'bathroom', 2, 2);

describe('styleFinishProduct', () => {
  it('is the product whose texture the style lays — laminate and plaster in a bedroom, tiles in a bathroom', () => {
    expect(styleFinishProduct(catalog, bedroom, 'floor', 'modern')?.id).toBe(1);
    expect(styleFinishProduct(catalog, bedroom, 'wall', 'modern')?.id).toBe(5);
    expect(styleFinishProduct(catalog, bathroom, 'floor', 'modern')?.id).toBe(3);
    expect(styleFinishProduct(catalog, bathroom, 'wall', 'modern')?.id).toBe(4);
  });

  it('falls back to the best finish of the same kind — never a laminate in a bathroom — or to nothing', () => {
    const withoutTiles = catalog.filter((p) => p.id !== 3);
    expect(styleFinishProduct(withoutTiles, bathroom, 'floor', 'modern')?.id).toBe(6);
    expect(styleFinishProduct(withoutTiles.filter((p) => p.id !== 6), bathroom, 'floor', 'modern')).toBeNull();
    expect(styleFinishProduct(catalog.filter((p) => p.id !== 1), bedroom, 'floor', 'modern')?.id).toBe(2);
    expect(styleFinishProduct([sofa], bedroom, 'floor', 'modern')).toBeNull();
  });
});

describe('styleFinish', () => {
  it('lays the style’s product over the whole surface, marked as the style’s, in the style’s colour', () => {
    const floor = styleFinish(bedroom, 'floor', 'modern', catalog);
    expect(floor).toMatchObject({ roomId: 'bed', surface: 'floor', origin: 'style', textureUrl: look.floor.textureUrl, colorHex: look.floor.colorHex, textureScaleM: 1.4 });
    expect(floor.product).toMatchObject({ productId: 1, qty: 12, unit: 'm2', totalPrice: 360 });
    const walls = styleFinish(bathroom, 'wall', 'modern', catalog);
    expect(walls.product).toMatchObject({ productId: 4, qty: 20 });
    expect(isStyleFinish(walls)).toBe(true);
  });

  it('is the style’s look alone where the catalogue has nothing for it, and for a ceiling', () => {
    expect(styleFinish(bedroom, 'floor', 'modern')).toEqual(defaultFinish(bedroom, 'floor', 'modern'));
    expect(styleFinish(bedroom, 'ceiling', 'modern', catalog)).toEqual(defaultFinish(bedroom, 'ceiling', 'modern'));
  });
});

describe('withStyleFinishes', () => {
  const rooms = [bedroom, bathroom];

  it('makes the style’s look the style’s product, an old unmarked one included', () => {
    const legacy = { ...defaultFinish(bathroom, 'floor', 'modern'), origin: undefined };
    const next = withStyleFinishes([defaultFinish(bedroom, 'floor', 'modern'), defaultFinish(bedroom, 'wall', 'modern'), legacy, defaultFinish(bathroom, 'wall', 'modern')], rooms, 'modern', catalog);
    expect(next.map((f) => [f.roomId, f.surface, f.product?.productId, f.origin])).toEqual([
      ['bed', 'floor', 1, 'style'],
      ['bed', 'wall', 5, 'style'],
      ['bath', 'floor', 3, 'style'],
      ['bath', 'wall', 4, 'style'],
    ]);
  });

  it('leaves what somebody chose, and gives a retyped room and a room with nothing the style’s', () => {
    const chosen = finishFromProduct(bedroom, 'floor', cheaperLaminate);
    const fromCalculator = finishFromProduct(bedroom, 'wall', wallTiles, 'calculator');
    // The bathroom was a bedroom when the style laid laminate in it.
    const stale = styleFinish(room('bath', 'bedroom', 2, 2), 'floor', 'modern', catalog);
    const next = withStyleFinishes([chosen, fromCalculator, stale], rooms, 'modern', catalog);
    expect(next[0]).toBe(chosen);
    expect(next[1]).toBe(fromCalculator);
    expect(next[2].product?.productId).toBe(3);
    expect(next.slice(3).map((f) => [f.roomId, f.surface, f.product?.productId])).toEqual([['bath', 'wall', 4]]);
  });

  it('takes the skirting and the cornice off a balcony, with or without a catalogue', () => {
    const balcony = room('bal', 'balcony', 3, 1.2);
    const trim = (roomId: string, surface: 'skirting' | 'cornice'): SurfaceFinish => ({ roomId, surface, colorHex: '#FFFFFF', textureUrl: null, textureScaleM: 1, product: null, trim: { profile: 'flat', heightM: 0.08, depthM: 0.015 }, origin: 'style' });
    const finishes = [trim('bal', 'skirting'), trim('bal', 'cornice'), trim('bed', 'skirting')];
    for (const list of [catalog, []]) {
      const next = withStyleFinishes(finishes, [bedroom, balcony], 'modern', list);
      expect(next.filter((f) => f.surface === 'skirting' || f.surface === 'cornice').map((f) => f.roomId)).toEqual(['bed']);
    }
  });

  it('is the same list when every floor and wall already is what it should be, or there is no catalogue', () => {
    const done: SurfaceFinish[] = rooms.flatMap((r) => [styleFinish(r, 'floor', 'modern', catalog), styleFinish(r, 'wall', 'modern', catalog)]);
    expect(withStyleFinishes(done, rooms, 'modern', catalog)).toBe(done);
    const bare = [defaultFinish(bedroom, 'floor', 'modern')];
    expect(withStyleFinishes(bare, rooms, 'modern', [])).toBe(bare);
    // A catalogue with nothing for a surface changes nothing there.
    expect(withStyleFinishes(bare, [bedroom], 'modern', [sofa])).toBe(bare);
  });
});

describe('each kind of room in its own look', () => {
  /** The catalogue's finish for a look, as `textures:stock` writes it. */
  const productFor = (id: number, textureUrl: string, surfaces: Array<'floor' | 'wall'>, wet = false) => surfaceProduct(id, textureUrl, surfaces, { wet, styleTags: ['scandinavian', 'modern', 'industrial', 'vintage'] });
  const styleLooks = STYLE_IDS.flatMap((id) => {
    const style = getStyle(id);
    return [...Object.values(style.surfaces), ...Object.values(style.rooms).flatMap((r) => [r?.floor, r?.wall])].filter((l): l is NonNullable<typeof l> => !!l);
  });

  it('is a file the app serves, maps and all', () => {
    const files = new Set(styleLooks.flatMap((l) => [l.textureUrl, l.normalUrl, l.roughnessUrl]).filter((u): u is string => !!u));
    for (const url of files) expect(existsSync(path.join(process.cwd(), 'public', url)), url).toBe(true);
  });

  it('paints and floors the rooms of one flat apart — and tiles a bathroom whatever its style', () => {
    const kitchen = room('kitchen', 'kitchen');
    const living = room('living', 'living_room');
    for (const id of STYLE_IDS) {
      const style = getStyle(id);
      const wall = (r: PlanRoom) => defaultFinish(r, 'wall', id).textureUrl;
      expect(wall(bedroom), id).not.toBe(wall(living));
      expect(defaultFinish(kitchen, 'floor', id).textureUrl, id).not.toBe(defaultFinish(living, 'floor', id).textureUrl);
      expect(defaultFinish(bathroom, 'floor', id).textureUrl).toBe(style.surfaces.wetFloor.textureUrl);
      expect(defaultFinish(bathroom, 'wall', id).textureUrl).toBe(style.surfaces.wetWall.textureUrl);
      // A bedroom's walls are paint: one of the paints, in its colour.
      expect(Object.keys(PAINT_COLORS).map((name) => paintLook(name as PaintName).textureUrl)).toContain(wall(bedroom));
    }
  });

  it('is bought as the product of that look — the bedroom’s paint, the kitchen’s tiles — and stands in with the style’s own where the catalogue lacks it', () => {
    const sage = productFor(20, paintLook('sage').textureUrl!, ['wall']);
    const warmWhite = productFor(21, paintLook('warm-white').textureUrl!, ['wall']);
    const terrazzo = productFor(22, getStyle('scandinavian').rooms.kitchen!.floor!.textureUrl!, ['floor', 'wall'], true);
    const oak = productFor(23, getStyle('scandinavian').surfaces.floor.textureUrl!, ['floor']);
    const plasterWarm = productFor(24, getStyle('scandinavian').surfaces.wall.textureUrl!, ['wall']);
    const shop = [sage, warmWhite, terrazzo, oak, plasterWarm];
    const kitchen = room('kitchen', 'kitchen');
    expect(styleFinishProduct(shop, bedroom, 'wall', 'scandinavian')?.id).toBe(20);
    expect(styleFinishProduct(shop, room('living', 'living_room'), 'wall', 'scandinavian')?.id).toBe(21);
    expect(styleFinishProduct(shop, kitchen, 'floor', 'scandinavian')?.id).toBe(22);
    expect(styleFinishProduct(shop, bedroom, 'floor', 'scandinavian')?.id).toBe(23);
    // A database the room paints have not reached: the style's own wall, in its own colour.
    const without = shop.filter((p) => p.id !== 20);
    expect(styleFinishProduct(without, bedroom, 'wall', 'scandinavian')?.id).toBe(24);
    expect(styleFinish(bedroom, 'wall', 'scandinavian', without).colorHex).toBe(getStyle('scandinavian').surfaces.wall.colorHex);
    expect(styleFinish(bedroom, 'wall', 'scandinavian', shop).colorHex).toBe(PAINT_COLORS.sage);
    // A room retyped is laid again in its new look.
    const laid = withStyleFinishes([styleFinish(bedroom, 'wall', 'scandinavian', shop)], [{ ...bedroom, type: 'living_room' }], 'scandinavian', shop);
    expect(laid[0].product?.productId).toBe(21);
  });

  it('ships every paint the styles lay in the migration that brings them to a database', () => {
    // The starting catalogue a new database gets (it carried MySQL's 0023 over to Postgres).
    const migration = readFileSync(path.join(process.cwd(), 'lib/db/migrations/0001_starting_catalogue.sql'), 'utf8');
    const laid = new Set(styleLooks.map((l) => l.textureUrl).filter((u): u is string => !!u && u.includes('/paint-')));
    expect(laid.size).toBeGreaterThan(0);
    for (const name of Object.keys(PAINT_COLORS)) {
      expect(migration).toContain(`'paint-interior-${name}'`);
      expect(migration).toContain(`'/textures/paint-${name}-diffuse.webp'`);
    }
    for (const url of laid) expect(migration).toContain(`'${url}'`);
  });
});

describe('a room the app tiles', () => {
  /** A finish of a category, tagged for every style, with a texture no look names unless given one. */
  const finish = (id: number, categorySlug: string, surfaces: Array<'floor' | 'wall'>, extra: { wet?: boolean; price?: number; textureUrl?: string } = {}): CatalogProduct =>
    ({ ...surfaceProduct(id, extra.textureUrl ?? `/textures/f${id}.webp`, surfaces, { wet: extra.wet, price: extra.price, styleTags: ['modern', 'scandinavian', 'industrial', 'vintage'] }), categorySlug }) as CatalogProduct;
  const plan = (rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 10, depth: 10 }, source: 'manual', wallThicknessM: 0.15 });
  const living = room('liv', 'living_room', 5, 4);
  const balcony = room('bal', 'balcony', 3, 1.2);
  const closedKitchen = room('k', 'kitchen', 3, 3);
  const openKitchen: PlanRoom = { ...closedKitchen, openings: [{ id: 'k-a', roomId: 'k', kind: 'archway', wallIndex: 1, t: 0.5, widthM: 1.2, heightM: 2.1, sillM: 0, exterior: false }] };
  const floorOf = (finishes: SurfaceFinish[], r: PlanRoom) => finishes.find((f) => f.roomId === r.id && f.surface === 'floor' && isBaseFinish(f))?.product?.productId;

  describe('falls back to a tile when the style’s own tile is not in the catalogue — never to the living room’s laminate', () => {
    // Modern's general floor is a laminate the catalogue has; its tile look (the balcony's, the
    // kitchen's, the bathroom's) is in nobody's catalogue.
    const oak = finish(1, 'laminate', ['floor'], { textureUrl: getStyle('modern').surfaces.floor.textureUrl! });
    const slate = finish(2, 'floor-tiles', ['floor'], { price: 58 });
    const terrazzo = finish(3, 'floor-tiles', ['floor', 'wall'], { wet: true, price: 39 });
    const paint = finish(4, 'paint', ['wall'], { textureUrl: getStyle('modern').surfaces.wall.textureUrl! });
    const shop = [oak, slate, terrazzo, paint];

    it('in the style’s finish', () => {
      for (const r of [balcony, closedKitchen]) expect(styleFinishProduct(shop, r, 'floor', 'modern')?.categorySlug, r.id).toBe('floor-tiles');
      expect(styleFinishProduct(shop, bathroom, 'floor', 'modern')?.id).toBe(terrazzo.id);
      // A room that shares the flat's floor still falls back to the style's floor.
      expect(styleFinishProduct(shop, bedroom, 'floor', 'modern')?.id).toBe(oak.id);
      // The walls of a balcony are painted, as the style paints them.
      expect(styleFinishProduct(shop, balcony, 'wall', 'modern')?.id).toBe(paint.id);
    });

    it('in a generated flat, every draw — and an open kitchen still wears the flat’s floor', () => {
      for (let seed = 1; seed <= 60; seed++) {
        const finishes = defaultFinishes(plan([living, balcony, openKitchen]), 'modern', shop, seededRng(seed));
        expect(shop.find((p) => p.id === floorOf(finishes, balcony))?.categorySlug, `seed ${seed}`).toBe('floor-tiles');
        expect(floorOf(finishes, openKitchen)).toBe(floorOf(finishes, living));
        const closed = defaultFinishes(plan([living, closedKitchen]), 'modern', shop, seededRng(seed));
        expect(shop.find((p) => p.id === floorOf(closed, closedKitchen))?.categorySlug, `seed ${seed}`).toBe('floor-tiles');
      }
    });
  });

  describe('lays the style’s own tile, whether or not it is made for a wet room too', () => {
    const scandinavian = getStyle('scandinavian');
    // Terracotta is the Scandinavian balcony's own, and flagged wet: it may go in a bathroom.
    const terracotta = finish(10, 'floor-tiles', ['floor'], { wet: true, price: 26, textureUrl: scandinavian.rooms.balcony!.floor!.textureUrl! });
    const slate = finish(11, 'floor-tiles', ['floor'], { price: 58 });
    const microcement = finish(12, 'floor-tiles', ['floor', 'wall'], { price: 45 });
    const oak = finish(13, 'laminate', ['floor'], { textureUrl: scandinavian.surfaces.floor.textureUrl! });
    const shop = [terracotta, slate, microcement, oak];

    it('on a balcony and in a closed kitchen, every draw: the style’s own floor first (decision 6)', () => {
      // Scandinavian's closed kitchen is terrazzo: a tile of its own look in the catalogue.
      const terrazzo = finish(14, 'floor-tiles', ['floor', 'wall'], { wet: true, price: 39, textureUrl: scandinavian.rooms.kitchen!.floor!.textureUrl! });
      const withTerrazzo = [...shop, terrazzo];
      for (let seed = 1; seed <= 200; seed++) {
        expect(generatedFinish(balcony, 'floor', 'scandinavian', withTerrazzo, seededRng(seed)).product!.productId, `seed ${seed}`).toBe(terracotta.id);
        expect(generatedFinish(closedKitchen, 'floor', 'scandinavian', withTerrazzo, seededRng(seed)).product!.productId, `seed ${seed}`).toBe(terrazzo.id);
      }
      expect(styleFinishProduct(shop, balcony, 'floor', 'scandinavian')?.id).toBe(terracotta.id);
    });

    it('draws as before where the style has no floor of its own for the room, and the room’s walls are drawn as they were', () => {
      // No terrazzo in the catalogue: the closed kitchen's floor is drawn among the tiles.
      const drawn = new Set<number>();
      for (let seed = 1; seed <= 200; seed++) drawn.add(generatedFinish(closedKitchen, 'floor', 'scandinavian', shop, seededRng(seed)).product!.productId);
      expect(drawn.size).toBeGreaterThan(1);
      expect(drawn.has(oak.id)).toBe(false);
      // The floor's draw is still taken, so the wall after it draws the same numbers.
      const walls = [finish(15, 'paint', ['wall']), finish(16, 'paint', ['wall']), finish(17, 'paint', ['wall'], { textureUrl: scandinavian.rooms.balcony!.wall!.textureUrl! })];
      for (let seed = 1; seed <= 40; seed++) {
        const rng = seededRng(seed);
        generatedFinish(balcony, 'floor', 'scandinavian', [...shop, ...walls], rng);
        const after = generatedFinish(balcony, 'wall', 'scandinavian', [...shop, ...walls], rng).product?.productId;
        const alone = seededRng(seed);
        alone();
        expect(after).toBe(generatedFinish(balcony, 'wall', 'scandinavian', [...shop, ...walls], alone).product?.productId);
      }
    });

    it('and the pass that keeps the style’s finishes keeps it there', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const laid = generatedFinish(balcony, 'floor', 'scandinavian', shop, seededRng(seed));
        expect(withStyleFinishes([laid], [balcony], 'scandinavian', shop)[0]).toBe(laid);
      }
    });

    it('but a wet room takes only what is made for one, the style’s own included', () => {
      // Industrial's bathroom floor is a slate made for dry rooms only.
      const industrialSlate = finish(20, 'floor-tiles', ['floor'], { price: 58, textureUrl: getStyle('industrial').surfaces.wetFloor.textureUrl! });
      const wetTile = finish(21, 'floor-tiles', ['floor'], { wet: true, price: 34 });
      const tiles = [industrialSlate, wetTile];
      expect(styleFinishProduct(tiles, bathroom, 'floor', 'industrial')?.id).toBe(wetTile.id);
      for (let seed = 1; seed <= 40; seed++) expect(generatedFinish(bathroom, 'floor', 'industrial', tiles, seededRng(seed)).product?.productId).toBe(wetTile.id);
    });
  });
});
