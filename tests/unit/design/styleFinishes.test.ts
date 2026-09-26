import { describe, expect, it } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
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
const cheaperLaminate = surfaceProduct(2, '/textures/other-wood.jpg', ['floor'], { price: 10, styleTags: ['modern', 'minimalist'] });
const floorTiles = surfaceProduct(3, look.wetFloor.textureUrl!, ['floor', 'wall'], { wet: true, price: 40 });
const wallTiles = surfaceProduct(4, look.wetWall.textureUrl!, ['wall'], { wet: true, price: 35 });
// The same file served from elsewhere, as an uploaded texture may be.
const plaster = surfaceProduct(5, `https://cdn.remonti.ge${look.wall.textureUrl}?v=2`, ['wall'], { price: 16 });
const otherWetFloor = surfaceProduct(6, '/textures/other-tile.jpg', ['floor'], { wet: true, price: 20 });
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

  it('is the same list when every floor and wall already is what it should be, or there is no catalogue', () => {
    const done: SurfaceFinish[] = rooms.flatMap((r) => [styleFinish(r, 'floor', 'modern', catalog), styleFinish(r, 'wall', 'modern', catalog)]);
    expect(withStyleFinishes(done, rooms, 'modern', catalog)).toBe(done);
    const bare = [defaultFinish(bedroom, 'floor', 'modern')];
    expect(withStyleFinishes(bare, rooms, 'modern', [])).toBe(bare);
    // A catalogue with nothing for a surface changes nothing there.
    expect(withStyleFinishes(bare, [bedroom], 'modern', [sofa])).toBe(bare);
  });
});
