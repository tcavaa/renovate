import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import { PAINT_COLORS, STYLE_IDS, getStyle, paintLook, type PaintName } from '@/lib/design/styles';
import { defaultFinish, finishFromProduct, isStyleFinish, styleFinish, styleFinishProduct, withStyleFinishes } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, SurfaceFinish } from '@/lib/design/types';

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
    const migration = readFileSync(path.join(process.cwd(), 'lib/db/migrations/0023_room_paints.sql'), 'utf8');
    const laid = new Set(styleLooks.map((l) => l.textureUrl).filter((u): u is string => !!u && u.includes('/paint-')));
    expect(laid.size).toBeGreaterThan(0);
    for (const name of Object.keys(PAINT_COLORS)) {
      expect(migration).toContain(`'paint-interior-${name}'`);
      expect(migration).toContain(`'/textures/paint-${name}-diffuse.webp'`);
    }
    for (const url of laid) expect(migration).toContain(`'${url}'`);
  });
});
