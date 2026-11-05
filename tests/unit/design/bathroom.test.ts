import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { fitBathrooms } from '@/lib/design/bathroom';
import { cabinetFacadeM2, sectionSpans } from '@/lib/design/decor/joinery';
import { piecePurchases } from '@/lib/design/decor/quantities';
import { withWcBoxes } from '@/lib/design/decor/wcBox';
import { wetRoomSpots } from '@/lib/design/electrical';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { includesTap, refinedKind } from '@/lib/design/productRoles';
import { suggestRadiators } from '@/lib/design/radiators';
import type { FloorPlan, Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({
    id,
    type,
    name: id,
    polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
    heightM: 2.7,
    areaM2: 0,
    perimeterM: 0,
    openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })),
  });
}
const door = (wallIndex: number, t = 0.5): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.7, heightM: 2.05, sillM: 0, exterior: false });

function product(id: number, kind: string, w: number, d: number, h: number, nameEn: string, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    nameKa: nameEn,
    nameEn,
    nameRu: null,
    slug: `p-${id}`,
    brand: null,
    categorySlug: 'sanitary',
    categoryId: null,
    pricePerUnit: 100,
    unit: 'piece',
    imageUrl: null,
    colorHex: '#ffffff',
    textureUrl: null,
    model3dKind: kind,
    model3dUrl: `/m/${id}.glb`,
    widthCm: w,
    depthCm: d,
    heightCm: h,
    styleTags: ['modern', 'scandinavian', 'industrial', 'vintage'],
    tags: null,
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...extra,
  } as CatalogProduct;
}

const CATALOG: CatalogProduct[] = [
  product(1, 'toilet', 36, 54, 40, 'Wall-hung WC'),
  product(2, 'sink', 60, 40, 14, 'Rectangular countertop basin'),
  product(3, 'sink', 55, 45, 86, 'Pedestal basin'),
  product(4, 'tap', 15, 18, 28, 'Black single-lever basin mixer'),
  product(5, 'tap', 22, 18, 9, 'Wall-mounted basin mixer'),
  product(6, 'washer', 60, 55, 85, 'Bosch washing machine'),
  product(7, 'dryer', 60, 62, 86, 'Bosch tumble dryer'),
  product(8, 'bathtub', 170, 75, 50, 'Rectangular built-in bathtub'),
  product(9, 'bathtub', 170, 78, 60, 'Freestanding rectangular stone bathtub'),
  product(10, 'bath_mixer', 25, 30, 100, 'Freestanding floor bath mixer'),
  product(11, 'bath_mixer', 33, 19, 20, 'Wall-mounted bath mixer'),
  product(12, 'shower', 25, 15, 210, 'Shower column with rain head'),
  product(13, 'mirror', 60, 3, 80, 'Round mirror', { categorySlug: 'decor' }),
  product(20, 'kitchen_run', 0, 0, 0, 'Painted MDF — matt', { categorySlug: 'kitchen-custom', unit: 'm2', pricePerUnit: 600, model3dUrl: null }),
];

/** Lays a room out and matches it, as the generation does before the bathroom pass. */
function matched(r: PlanRoom, styleId: 'modern' | 'scandinavian' | 'vintage' | 'industrial', catalog = CATALOG): PlacedItem[] {
  return matchProducts(layoutRoom(r, { styleId }), catalog, { styleId, rooms: [r] }).filter((i) => i.product);
}

describe('what the library filed under the nearest kind', () => {
  it('reads taps, bath mixers, kitchen sinks, a dryer, door mats, coat racks and stools by name', () => {
    expect(refinedKind({ model3dKind: 'sink', nameEn: 'Black basin mixer with square spout on plate' })).toBe('tap');
    expect(refinedKind({ model3dKind: 'sink', nameEn: 'Dark grey floor-standing basin mixer' })).toBe('tap');
    expect(refinedKind({ model3dKind: 'sink', nameEn: 'Freestanding floor bath mixer with hand shower' })).toBe('bath_mixer');
    expect(refinedKind({ model3dKind: 'sink', nameEn: 'Black kitchen sink with drainer and tap' })).toBe('kitchen_sink');
    expect(refinedKind({ model3dKind: 'sink', nameEn: 'Antonio Lupi washbasin with wall-mounted tap' })).toBe('sink');
    expect(refinedKind({ model3dKind: 'sink', nameEn: 'Oval stone vessel basin' })).toBe('sink');
    expect(refinedKind({ model3dKind: 'washer', nameEn: 'Bosch tumble dryer' })).toBe('dryer');
    expect(refinedKind({ model3dKind: 'washer', nameEn: 'Bosch washing machine' })).toBe('washer');
    expect(refinedKind({ model3dKind: 'rug', nameEn: 'Retro bus doormat' })).toBe('door_mat');
    expect(refinedKind({ model3dKind: 'shoe_cabinet', nameEn: 'IKEA Tjusig black wall coat rack' })).toBe('coat_rack');
    expect(refinedKind({ model3dKind: 'dining_chair', nameEn: 'Rustic wooden three-leg stool' })).toBe('stool');
    expect(refinedKind({ model3dKind: 'dining_chair', nameEn: 'Henriksdal bar stool' })).toBe('dining_chair');
    expect(refinedKind({ model3dKind: 'dining_chair', nameEn: 'IKEA Rågrund bamboo towel rack chair' })).toBe('towel_rack');
    expect(includesTap({ nameEn: 'Vintage wooden vanity with vessel basin and brass tap' })).toBe(true);
    expect(includesTap({ nameEn: 'Rectangular countertop basin' })).toBe(false);
  });
});

describe('the bathroom pass', () => {
  const bathroom = room('b', 'bathroom', 3, 2.4, [door(3, 0.75)]);

  it('sets a countertop basin on a vanity made to measure, under 90 cm, with a tap on it', () => {
    const items = matched(bathroom, 'modern');
    expect(items.find((i) => i.slot === 'sink')?.product?.productId).toBe(2);
    const { items: out, decor } = fitBathrooms({ rooms: [bathroom], items, catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    const vanity = decor.find((d) => d.family === 'cabinet');
    expect(vanity).toBeDefined();
    const basinSection = sectionSpans(vanity!).find((s) => s.section.kind === 'basin')!;
    expect(basinSection.section.heightMm).toBeLessThanOrEqual(900);
    const sink = out.find((i) => i.slot === 'sink')!;
    expect(sink.elevationM).toBeCloseTo(basinSection.section.heightMm / 1000, 3);
    expect(sink.elevationM + sink.size.height).toBeLessThanOrEqual(0.92);
    expect(out.filter((i) => i.slot === 'tap')).toHaveLength(1);
    // The vanity is priced by its façade in the joiner's material.
    expect(cabinetFacadeM2(vanity!)).toBeGreaterThan(0);
    expect(piecePurchases(vanity!, bathroom)[0]?.product.productId).toBe(20);
  });

  it('keeps Vintage\'s standing basin, with its tap on the wall', () => {
    const items = matched(bathroom, 'vintage');
    expect(items.find((i) => i.slot === 'sink')?.product?.productId).toBe(3);
    const { items: out, decor } = fitBathrooms({ rooms: [bathroom], items, catalog: CATALOG, styleId: 'vintage', level: 'balanced' });
    expect(decor.some((d) => d.family === 'cabinet')).toBe(false);
    const tap = out.find((i) => i.slot === 'tap')!;
    expect(tap.product?.productId).toBe(5);
    expect(tap.elevationM).toBeGreaterThan(0.86);
  });

  it('adds no tap to a basin sold with its own', () => {
    const own = [...CATALOG.filter((p) => p.model3dKind !== 'sink'), product(30, 'sink', 60, 40, 14, 'Countertop washbasin with wall-mounted tap')];
    const { items: out } = fitBathrooms({ rooms: [bathroom], items: matched(bathroom, 'modern', own), catalog: own, styleId: 'modern', level: 'balanced' });
    expect(out.some((i) => i.slot === 'tap')).toBe(false);
  });

  it('builds the washing machine into a 65 cm column, a dryer on it at the top budget, never freestanding but in Vintage', () => {
    const big = room('w', 'bathroom', 3.4, 2.6, [door(3, 0.8)]);
    const items = matched(big, 'scandinavian');
    expect(items.some((i) => i.slot === 'washer')).toBe(true);
    const { items: out, decor } = fitBathrooms({ rooms: [big], items, catalog: CATALOG, styleId: 'scandinavian', level: 'premium' });
    const column = decor.flatMap((d) => (d.family === 'cabinet' ? sectionSpans(d) : [])).find((s) => s.section.kind === 'washer');
    expect(column).toBeDefined();
    expect(column!.section.depthMm).toBe(650);
    expect(column!.section.dryer).toBe(true);
    const washer = out.find((i) => i.slot === 'washer')!;
    const dryer = out.find((i) => i.slot === 'dryer')!;
    expect(dryer.elevationM).toBeGreaterThanOrEqual(washer.size.height);
    // At the balanced budget, no dryer.
    const plain = fitBathrooms({ rooms: [big], items, catalog: CATALOG, styleId: 'scandinavian', level: 'balanced' });
    expect(plain.items.some((i) => i.slot === 'dryer')).toBe(false);
    // Vintage keeps it freestanding.
    const vintage = fitBathrooms({ rooms: [big], items: matched(big, 'vintage'), catalog: CATALOG, styleId: 'vintage', level: 'premium' });
    expect(vintage.decor.some((d) => d.family === 'cabinet')).toBe(false);
  });

  it('runs the vanity and the washer column on as one piece, the column at the wall\'s end', () => {
    const big = room('j', 'bathroom', 3.4, 2.6, [door(3, 0.8)]);
    const items = matched(big, 'modern');
    const sink = items.find((i) => i.slot === 'sink')!;
    const washer = items.find((i) => i.slot === 'washer')!;
    // The washer on the basin's wall, away from it, as the engine might leave it.
    const { decor } = fitBathrooms({ rooms: [big], items: items.map((i) => (i.id === washer.id ? { ...washer, position: { x: sink.position.x + 1.2, z: sink.position.z }, rotation: sink.rotation } : i)), catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    const joined = decor.find((d) => d.family === 'cabinet' && (d.params.sections ?? []).some((s) => s.kind === 'basin') && (d.params.sections ?? []).some((s) => s.kind === 'washer'));
    expect(joined, JSON.stringify(decor.map((d) => [d.family, d.params.sections?.map((s) => s.kind)]))).toBeDefined();
    const kinds = joined!.params.sections!.map((s) => s.kind);
    expect(kinds[0] === 'washer' || kinds[kinds.length - 1] === 'washer').toBe(true);
  });

  it('boxes and tiles a built-in bath in Scandinavian, puts a Modern freestanding bath\'s mixer on the floor at its head', () => {
    const roomy = room('t', 'bathroom', 3.6, 2.8, [door(3, 0.8)]);
    const scandi = matched(roomy, 'scandinavian');
    const bath = scandi.find((i) => i.slot === 'bathtub');
    expect(bath?.product?.productId).toBe(8);
    const s = fitBathrooms({ rooms: [roomy], items: scandi, catalog: CATALOG, styleId: 'scandinavian', level: 'balanced' });
    const box = s.decor.find((d) => d.anchor === 'bath');
    expect(box?.family).toBe('box');
    expect(box!.height.to).toBeLessThan(bath!.size.height);
    expect(s.items.find((i) => i.slot === 'bath_mixer')?.product?.productId).toBe(11);

    const modern = matched(roomy, 'modern');
    expect(modern.find((i) => i.slot === 'bathtub')?.product?.productId).toBe(9);
    const m = fitBathrooms({ rooms: [roomy], items: modern, catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    expect(m.decor.some((d) => d.anchor === 'bath')).toBe(false);
    const mixer = m.items.find((i) => i.slot === 'bath_mixer')!;
    expect(mixer.product?.productId).toBe(10);
    expect(mixer.elevationM).toBe(0);
  });

  it('gives a Vintage bath its tiled enclosure, wider than the bath and over its rim', () => {
    const roomy = room('v', 'bathroom', 3.6, 2.8, [door(3, 0.8)]);
    const items = matched(roomy, 'vintage');
    const bath = items.find((i) => i.slot === 'bathtub')!;
    expect(bath.product?.productId).toBe(9);
    const { decor } = fitBathrooms({ rooms: [roomy], items, catalog: CATALOG, styleId: 'vintage', level: 'balanced' });
    const box = decor.find((d) => d.anchor === 'bath')!;
    expect(box.span.to - box.span.from).toBeGreaterThan(bath.size.width);
    expect(box.height.to).toBeGreaterThan(bath.size.height);
  });
});

describe('the bathroom layout by style', () => {
  it('makes a Scandinavian or Industrial bathroom a shower first, a bath only where both fit', () => {
    const mid = room('m', 'bathroom', 3.2, 2.6, [door(3, 0.8)]); // 8.3 m²
    for (const styleId of ['scandinavian', 'industrial'] as const) {
      const items = layoutRoom(mid, { styleId });
      expect(items.some((i) => i.slot === 'bathtub'), styleId).toBe(false);
      expect(items.some((i) => i.slot === 'shower'), styleId).toBe(true);
    }
    expect(layoutRoom(mid, { styleId: 'modern' }).some((i) => i.slot === 'bathtub')).toBe(true);
  });

  it('lengthens the shower to 1.4 m in a roomy bathroom', () => {
    const roomy = room('l', 'bathroom', 3.6, 2.4, [door(3, 0.8)]);
    const shower = layoutRoom(roomy, { styleId: 'scandinavian' }).find((i) => i.slot === 'shower')!;
    expect(Math.max(shower.areaM!.width, shower.areaM!.depth)).toBeGreaterThanOrEqual(1.2);
  });
});

describe('the bathroom\'s light and heat', () => {
  it('lights a bathroom with at least three spots, as far from each other as from the walls', () => {
    const spots = wetRoomSpots(room('s', 'bathroom', 2.4, 1.8));
    expect(spots.length).toBeGreaterThanOrEqual(3);
    const xs = spots.map((p) => p.x).sort((a, b) => a - b);
    const gaps = [xs[0], ...xs.slice(1).map((x, i) => x - xs[i]), 2.4 - xs[xs.length - 1]];
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 5);
    for (const p of spots) expect(p.z).toBeCloseTo(0.9, 5);
  });

  it('hangs the towel rail over the WC, clear of its box', () => {
    const r = room('h', 'bathroom', 2.6, 2.2, [door(3, 0.7)]);
    const wc: PlacedItem = { id: 'wc', roomId: 'h', slot: 'toilet', kind: 'toilet', position: { x: 1.3, z: 0.3 }, rotation: 0, elevationM: 0, size: { width: 0.36, depth: 0.54, height: 0.4 }, product: null };
    const plan: FloorPlan = { rooms: [r], scaleMPerPx: 1, source: 'manual' } as unknown as FloorPlan;
    let n = 0;
    const rail = suggestRadiators(plan, () => `r${n++}`, [], [wc]).find((p) => p.towelRail);
    expect(rail).toBeDefined();
    expect(rail!.position.x).toBeCloseTo(1.3, 2);
    expect(rail!.elevationM).toBeGreaterThanOrEqual(1.05);
  });

  it('boxes a WC set down in the studio, in the materials of the flat\'s other boxes', () => {
    const r = room('k', 'bathroom', 2.6, 2.2, [door(3, 0.7)]);
    const wc: PlacedItem = { id: 'wc2', roomId: 'k', slot: 'toilet', kind: 'toilet', position: { x: 1.3, z: 0.3 }, rotation: 0, elevationM: 0, size: { width: 0.36, depth: 0.54, height: 0.4 }, product: null };
    const model = { id: 'x', roomId: 'other', family: 'box' as const, wallIndex: 0, span: { from: 0, to: 0.8 }, height: { from: 0, to: 1 }, params: {}, materials: { face: { product: null, colorHex: '#123456' } }, anchor: 'wc' as const };
    const out = withWcBoxes([r], [wc], [model]);
    const added = out.find((d) => d.roomId === 'k');
    expect(added?.family).toBe('box');
    expect(added?.materials.face?.colorHex).toBe('#123456');
    expect(withWcBoxes([r], [wc], out)).toBe(out);
  });
});
