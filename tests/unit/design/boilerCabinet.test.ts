import { describe, expect, it } from 'vitest';
import { boilerCabinetCandidates, boilerCabinetFacadeM2, boilerCabinetSize, boilerRoom, isOutdoorCabinet, isThermalCabinet, withBoilerCabinet, withBoilerCabinets } from '@/lib/design/boilerCabinet';
import { withEquipmentProducts } from '@/lib/design/equipment';
import { priceScene } from '@/lib/design/pricing';
import { tickFor } from '@/lib/design/ticks';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { DesignScene, FloorPlan, TechnicalPoint, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const material = (id: number, price: number, styles: string[] = []): CatalogProduct =>
  ({ id, nameKa: `m${id}`, slug: `m${id}`, brand: null, categorySlug: 'boiler-cabinet', pricePerUnit: price, unit: 'm2', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: styles, tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;
const boilerProduct = { id: 50, nameKa: 'ქვაბი', slug: 'b', brand: null, categorySlug: 'boilers', pricePerUnit: 1900, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: 'boiler', model3dUrl: '/models/equipment/b.glb', widthCm: 40, depthCm: 30, heightCm: 70, styleTags: [], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null } as unknown as CatalogProduct;
const boiler: TechnicalPoint = { id: 'b', kind: 'boiler', roomId: 'k', position: P(0.1, 1), elevationM: 1.6, origin: 'user' };
const planWith = (points: TechnicalPoint[]): FloorPlan => ({
  rooms: [refreshRoom({ id: 'k', type: 'kitchen', name: 'k', polygon: [P(0, 0), P(3, 0), P(3, 3), P(0, 3)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] })],
  metresPerPixel: null,
  bounds: { width: 3, depth: 3 },
  source: 'manual',
  wallThicknessM: 0.12,
  technical: { points },
});

describe('the boiler’s ventilated cabinet', () => {
  it('is the boiler and 10 cm all round, no deeper than 60 cm, and bought by its front and sides', () => {
    const size = boilerCabinetSize({ sizeM: { width: 0.4, depth: 0.3, height: 0.7 } });
    expect(size.width).toBeCloseTo(0.6, 6);
    expect(size.depth).toBeCloseTo(0.4, 6);
    expect(size.height).toBeCloseTo(0.9, 6);
    expect(boilerCabinetSize({ sizeM: { width: 0.6, depth: 0.7, height: 0.9 } }).depth).toBe(0.6);
    expect(boilerCabinetFacadeM2({ sizeM: { width: 0.4, depth: 0.3, height: 0.7 } })).toBeCloseTo(0.6 * 0.9 + 2 * 0.4 * 0.9, 2);
  });

  it('comes with the boiler in the style’s material, then the cheapest; stays off when taken off', () => {
    const catalog = [material(1, 700, ['vintage']), material(2, 380), material(3, 520, ['modern'])];
    expect(boilerCabinetCandidates(catalog, 'modern').map((p) => p.id)).toEqual([3, 2, 1]);
    const plan = withEquipmentProducts(planWith([boiler]), [...catalog, boilerProduct], 'modern');
    const point = plan.technical!.points[0];
    expect(point.product?.productId).toBe(50);
    expect(point.cabinet?.productId).toBe(3);
    expect(point.cabinet?.qty).toBe(boilerCabinetFacadeM2(point));
    const off = planWith([withBoilerCabinet(point, null)]);
    expect(withBoilerCabinets(off, catalog, 'modern')).toBe(off);
  });

  it('is a line of its own in the budget, by the m² of façade', () => {
    const withCabinet = withBoilerCabinet(boiler, material(2, 380));
    const scene: DesignScene = { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [], finishes: [], electrical: [] };
    const line = priceScene(planWith([withCabinet]), scene).lines.find((l) => l.key === 'product-2')!;
    expect(line.unit).toBe('m2');
    expect(line.qty).toBe(boilerCabinetFacadeM2(boiler));
    expect(line.total).toBeCloseTo(380 * boilerCabinetFacadeM2(boiler), 2);
    expect(line.tick).toBe(tickFor.cabinet(2));
    expect(line.estimated).toBe(false);
  });
});

describe('a boiler’s cupboard on a balcony', () => {
  // The owner's photo of 13 Nov 2026: a cupboard from the floor to the ceiling, insulated.
  const balcony = refreshRoom({ id: 'bal', type: 'balcony', name: 'bal', polygon: [P(0, 3), P(3, 3), P(3, 4.2), P(0, 4.2)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
  const thermal = { ...material(9, 640), slug: 'boiler-cabinet-thermal' } as CatalogProduct;
  const catalog = [material(1, 520, ['modern']), material(2, 380), thermal];
  const outside: TechnicalPoint = { id: 'b', kind: 'boiler', roomId: 'bal', position: P(1.5, 3.1), elevationM: 1.6, origin: 'user' };
  const flat = (points: TechnicalPoint[]): FloorPlan => ({ ...planWith(points), rooms: [...planWith([]).rooms, balcony] });

  it('stands from the floor to the ceiling, at least 80 cm wide, and is bought by that façade', () => {
    expect(isOutdoorCabinet(balcony)).toBe(true);
    expect(boilerCabinetSize(outside, balcony)).toEqual({ width: 0.8, depth: 0.45, height: 2.7 });
    expect(boilerCabinetFacadeM2(outside, balcony)).toBeCloseTo(0.8 * 2.7 + 2 * 0.45 * 2.7, 2);
    // Indoors it is the boiler's size and a hand all round, as before.
    expect(boilerCabinetSize(outside, planWith([]).rooms[0]).height).toBeCloseTo(0.92, 3);
    expect(boilerRoom(flat([outside]), outside)?.id).toBe('bal');
  });

  it('is made in the insulated material there by itself, and that material goes last indoors', () => {
    expect(isThermalCabinet(thermal)).toBe(true);
    expect(isThermalCabinet(catalog[0])).toBe(false);
    expect(boilerCabinetCandidates(catalog, 'modern', balcony)[0].id).toBe(9);
    expect(boilerCabinetCandidates(catalog, 'modern', planWith([]).rooms[0]).map((p) => p.id)).toEqual([1, 2, 9]);
    const fitted = withBoilerCabinets(flat([outside]), catalog, 'modern').technical!.points[0];
    expect(fitted.cabinet?.productId).toBe(9);
    expect(fitted.cabinet?.qty).toBe(boilerCabinetFacadeM2(outside, balcony));
  });

  it('follows the boiler indoors and out when the app chose its material, and stays when the person did', () => {
    const indoors = withBoilerCabinets(planWith([boiler]), catalog, 'modern').technical!.points[0];
    expect(indoors.cabinet?.productId).toBe(1);
    // The same boiler carried out onto the balcony.
    const carried = { ...indoors, roomId: 'bal', position: P(1.5, 3.1) };
    expect(withBoilerCabinets(flat([carried]), catalog, 'modern').technical!.points[0].cabinet?.productId).toBe(9);
    const chosen = withBoilerCabinet(carried, catalog[1], balcony, true);
    expect(chosen.cabinetChosen).toBe(true);
    const kept = withBoilerCabinets(flat([chosen]), catalog, 'modern');
    expect(kept.technical!.points[0].cabinet?.productId).toBe(2);
    // Taken off, it stays off.
    const off = flat([withBoilerCabinet(carried, null)]);
    expect(withBoilerCabinets(off, catalog, 'modern')).toBe(off);
  });
});

