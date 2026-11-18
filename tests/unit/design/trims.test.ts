import { describe, expect, it } from 'vitest';
import { STYLE_TRIMS, defaultTrim, styleTrim, styleTrimProduct, trimFromProduct, trimLengthM, trimOptions, trimOutline } from '@/lib/design/trims';
import { defaultFinishes } from '@/lib/design/generateScene';
import { priceScene } from '@/lib/design/pricing';
import { withStyleFinishes } from '@/lib/design/surfaces';
import { polygonAreaM2, polygonPerimeterM, signedArea } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { DesignScene, FloorPlan, PlanRoom, TrimProfile } from '@/lib/design/types';

const polygon = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 3 },
];
const room: PlanRoom = { id: 'r', type: 'bedroom', name: 'Bedroom', polygon, heightM: 2.8, areaM2: polygonAreaM2(polygon), perimeterM: polygonPerimeterM(polygon), openings: [{ id: 'd', kind: 'door', wallIndex: 0, t: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0, roomId: 'r', exterior: false }, { id: 'w', kind: 'window', wallIndex: 2, t: 0.5, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: 'r', exterior: true }] };
const moulding = (id: number, slug: 'skirting' | 'cornice', price: number, styles: string[], specs: object): CatalogProduct => ({ id, nameKa: `m${id}`, slug: `m${id}`, brand: null, categorySlug: slug, pricePerUnit: price, unit: 'linear_m', imageUrl: null, colorHex: '#eeeeee', textureUrl: null, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: styles, tags: [], isFeatured: false, specs, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;

describe('trims', () => {
  it('runs a skirting board round the room less its doorways, a cornice all the way', () => {
    expect(trimLengthM(room, 'skirting')).toBeCloseTo(13.1, 6);
    expect(trimLengthM(room, 'cornice')).toBeCloseTo(14, 6);
  });

  it('gives every profile a closed outline on the wall, wound so its face looks into the room', () => {
    const profiles: TrimProfile[] = ['flat', 'rounded', 'stepped', 'ogee', 'cove'];
    for (const kind of ['skirting', 'cornice'] as const) {
      for (const profile of profiles) {
        const outline = trimOutline(kind, { profile, heightM: 0.1, depthM: kind === 'cornice' ? 0.1 : 0.02 });
        expect(outline.length).toBeGreaterThanOrEqual(4);
        expect(outline[0][0]).toBe(0);
        expect(outline[outline.length - 1][0]).toBe(0);
        // Out along the bottom, up the face, back along the top: counter-clockwise in (out, up).
        expect(signedArea(outline.map(([x, z]) => ({ x, z })))).toBeGreaterThan(0);
        for (const [out, up] of outline) {
          expect(out).toBeGreaterThanOrEqual(-1e-9);
          if (kind === 'skirting') expect(up).toBeGreaterThanOrEqual(-1e-9);
          else expect(up).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });

  it('prices a chosen moulding by the metre and takes its shape from the product', () => {
    const finish = trimFromProduct(room, 'skirting', moulding(1, 'skirting', 9, ['modern'], { profile: 'ogee', heightCm: 12, depthCm: 2 }));
    expect(finish.surface).toBe('skirting');
    expect(finish.trim).toEqual({ profile: 'ogee', heightM: 0.12, depthM: 0.02 });
    expect(finish.product?.qty).toBeCloseTo(13.1, 6);
    expect(finish.product?.totalPrice).toBeCloseTo(117.9, 6);
  });

  it('draws the style’s own moulding for free, and no cornice where the style has none', () => {
    expect(defaultTrim(room, 'skirting', 'vintage').trim).toEqual({ profile: 'ogee', heightM: STYLE_TRIMS.vintage.skirting!.heightM, depthM: STYLE_TRIMS.vintage.skirting!.depthM });
    expect(defaultTrim(room, 'cornice', 'modern').trim).toBeNull();
    expect(defaultTrim(room, 'cornice', 'modern').product).toBeNull();
  });

  it('offers the style’s mouldings first, then the cheapest', () => {
    const catalog = [moulding(1, 'skirting', 30, ['vintage'], {}), moulding(2, 'skirting', 8, ['modern'], {}), moulding(3, 'skirting', 5, ['vintage'], {}), moulding(4, 'cornice', 1, ['modern'], {})];
    expect(trimOptions(catalog, 'skirting', 'modern').map((p) => p.id)).toEqual([2, 3, 1]);
    expect(trimOptions(catalog, 'cornice', 'modern').map((p) => p.id)).toEqual([4]);
  });
});

describe('the style’s mouldings bought', () => {
  // The seeded range: each style's board and cornice as a product of its profile, height and colour.
  const range = [
    { ...moulding(547, 'skirting', 9, ['modern', 'scandinavian'], { profile: 'flat', heightCm: 8, depthCm: 1.6 }), colorHex: '#F4F4F2' },
    { ...moulding(548, 'skirting', 14, ['modern', 'scandinavian', 'vintage'], { profile: 'stepped', heightCm: 12, depthCm: 1.8 }), colorHex: '#F7F5F0' },
    { ...moulding(551, 'skirting', 28, ['vintage'], { profile: 'ogee', heightCm: 14, depthCm: 2.2 }), colorHex: '#EFE6D4' },
    { ...moulding(552, 'cornice', 11, ['scandinavian', 'modern'], { profile: 'cove', heightCm: 6, depthCm: 6 }), colorHex: '#FAF8F4' },
    { ...moulding(554, 'cornice', 32, ['vintage'], { profile: 'ogee', heightCm: 11, depthCm: 11 }), colorHex: '#F3ECDD' },
  ] as CatalogProduct[];
  const plan: FloorPlan = { rooms: [room, { ...room, id: 'b', type: 'balcony' }], metresPerPixel: null, bounds: { width: 4, depth: 3 }, source: 'manual', wallThicknessM: 0.12 };

  it('takes the catalogue’s moulding of the style’s own profile and height, and none where the style has no cornice', () => {
    expect(styleTrimProduct(range, 'skirting', 'modern')?.id).toBe(547);
    expect(styleTrimProduct(range, 'skirting', 'vintage')?.id).toBe(551);
    expect(styleTrimProduct(range, 'cornice', 'vintage')?.id).toBe(554);
    // Scandinavian's rounded 7 cm board is not in this range: the first of its own.
    expect(styleTrimProduct(range, 'skirting', 'scandinavian')?.id).toBe(547);
    // Modern has no cornice, though the range has one tagged modern.
    expect(styleTrimProduct(range, 'cornice', 'modern')).toBeNull();
    // Industrial has no board in this range: drawn, not bought.
    expect(styleTrimProduct(range, 'skirting', 'industrial')).toBeNull();
    expect(styleTrim(room, 'skirting', 'industrial', range).product).toBeNull();
  });

  it('lays them round every room a generated flat has but the balcony, still the style’s, and the budget buys the metres', () => {
    const finishes = defaultFinishes(plan, 'vintage', range);
    const skirting = finishes.find((f) => f.roomId === 'r' && f.surface === 'skirting')!;
    expect(skirting.origin).toBe('style');
    expect(skirting.product?.productId).toBe(551);
    expect(skirting.product?.qty).toBeCloseTo(trimLengthM(room, 'skirting'), 6);
    expect(finishes.find((f) => f.roomId === 'r' && f.surface === 'cornice')?.product?.productId).toBe(554);
    expect(finishes.some((f) => f.roomId === 'b' && (f.surface === 'skirting' || f.surface === 'cornice'))).toBe(false);
    const scene: DesignScene = { styleId: 'vintage', mode: 'design_only', budgetGel: null, items: [], finishes };
    const lines = priceScene(plan, scene).lines;
    expect(lines.find((l) => l.key === 'product-551')?.qty).toBeCloseTo(13.1, 6);
    expect(lines.find((l) => l.key === 'product-554')?.qty).toBeCloseTo(14, 6);
    // Fitted by the metre in a renovation (`trim_install`)…
    expect(priceScene(plan, { ...scene, mode: 'full' }, { homeState: 'white_frame' }).lines.find((l) => l.key === 'trim_install')?.qty).toBeCloseTo(27.1, 6);
    // …but a design-only project pays no fitting for the style's mouldings, as for the style's
    // floors and walls: nobody chose them.
    expect(lines.find((l) => l.key === 'trim_install')).toBeUndefined();
  });

  it('fits a moulding somebody chose in a design-only project, beside the style’s that it does not fit', () => {
    const chosen = trimFromProduct(room, 'skirting', range[1]);
    const style = styleTrim(room, 'cornice', 'vintage', range);
    const scene: DesignScene = { styleId: 'vintage', mode: 'design_only', budgetGel: null, items: [], finishes: [chosen, style] };
    expect(priceScene(plan, scene).lines.find((l) => l.key === 'trim_install')?.qty).toBeCloseTo(chosen.product!.qty, 6);
  });

  it('turns the style’s drawn moulding into its product once the catalogue is in, and keeps one somebody chose', () => {
    const drawn = [defaultTrim(room, 'skirting', 'vintage'), defaultTrim(room, 'cornice', 'vintage')];
    const priced = withStyleFinishes(drawn, [room], 'vintage', range);
    expect(priced.filter((f) => f.product).map((f) => f.product!.productId).sort()).toEqual([551, 554]);
    expect(withStyleFinishes(priced, [room], 'vintage', range)).toBe(priced);
    const chosen = [trimFromProduct(room, 'skirting', range[1])];
    expect(withStyleFinishes(chosen, [room], 'vintage', range).find((f) => f.surface === 'skirting')?.product?.productId).toBe(548);
  });
});
