import { describe, expect, it } from 'vitest';
import { STYLE_TRIMS, defaultTrim, trimFromProduct, trimLengthM, trimOptions, trimOutline } from '@/lib/design/trims';
import { polygonAreaM2, polygonPerimeterM, signedArea } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, TrimProfile } from '@/lib/design/types';

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
