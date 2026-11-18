import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { fitBathrooms } from '@/lib/design/bathroom';
import { cabinetFacadeM2, decorFootprint, freeStretch, sectionSpans } from '@/lib/design/decor/joinery';
import { footprintQuad, quadsOverlap } from '@/lib/design/rules';
import { floorTaken } from '@/lib/design/shower';
import { roomEdges } from '@/lib/design/planGeometry';
import { piecePurchases } from '@/lib/design/decor/quantities';
import { withWcBoxes } from '@/lib/design/decor/wcBox';
import { wetRoomSpots } from '@/lib/design/electrical';
import { matchProducts, toSceneProduct, type CatalogProduct } from '@/lib/design/matcher';
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
/** Corners pulled in towards their middle by `by`: what touches is not in. */
function shrink(corners: Array<{ x: number; z: number }>, by: number) {
  const c = corners.reduce((a, p) => ({ x: a.x + p.x / corners.length, z: a.z + p.z / corners.length }), { x: 0, z: 0 });
  return corners.map((p) => {
    const d = Math.hypot(p.x - c.x, p.z - c.z) || 1;
    return { x: p.x - ((p.x - c.x) / d) * by, z: p.z - ((p.z - c.z) / d) * by };
  });
}

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

  it('hangs the mirror over the basin clear of the basin and of the tap put on it, by the matcher\'s 12 cm', () => {
    const items = matched(bathroom, 'modern');
    const before = items.find((i) => i.slot === 'mirror')!;
    const { items: out } = fitBathrooms({ rooms: [bathroom], items, catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    const mirror = out.find((i) => i.slot === 'mirror')!;
    const tap = out.find((i) => i.slot === 'tap')!;
    const sink = out.find((i) => i.slot === 'sink')!;
    // The tap on the wall over the rim reaches past where the matcher hung the mirror.
    expect(tap.elevationM + tap.size.height).toBeGreaterThan(before.elevationM);
    expect(mirror.elevationM).toBeGreaterThanOrEqual(tap.elevationM + tap.size.height + 0.12 - 1e-6);
    expect(mirror.elevationM).toBeGreaterThanOrEqual(sink.elevationM + sink.size.height + 0.12 - 1e-6);
    expect(mirror.elevationM + mirror.size.height).toBeLessThanOrEqual(bathroom.heightM);
    expect(mirror.position).toEqual(before.position);
  });

  it('hangs a wall tap, not a deck one, over a basin on a vanity with no deck behind it', () => {
    const items = matched(bathroom, 'modern');
    const { items: out } = fitBathrooms({ rooms: [bathroom], items, catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    const sink = out.find((i) => i.slot === 'sink')!;
    const tap = out.find((i) => i.slot === 'tap')!;
    // The basin fills the vanity's depth: the tap goes on the wall over its rim — a wall mixer (#5),
    // never the 28 cm deck mixer (#4) hung on the wall.
    expect(tap.elevationM).toBeGreaterThan(sink.elevationM + sink.size.height);
    expect(tap.product?.productId).toBe(5);
    // A catalogue with no wall tap keeps a tap on the basin all the same.
    const deckOnly = CATALOG.filter((p) => p.id !== 5);
    const kept = fitBathrooms({ rooms: [bathroom], items: matched(bathroom, 'modern', deckOnly), catalog: deckOnly, styleId: 'modern', level: 'balanced' });
    expect(kept.items.find((i) => i.slot === 'tap')?.product?.productId).toBe(4);
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
    // The room's shower stands in the corner at the far end of the basin's wall; without it there
    // the column goes to that end.
    const items = matched(big, 'modern').filter((i) => i.slot !== 'shower');
    const sink = items.find((i) => i.slot === 'sink')!;
    const washer = items.find((i) => i.slot === 'washer')!;
    // The washer on the basin's wall, away from it, as the engine might leave it.
    const { decor } = fitBathrooms({ rooms: [big], items: items.map((i) => (i.id === washer.id ? { ...washer, position: { x: sink.position.x + 1.2, z: sink.position.z }, rotation: sink.rotation } : i)), catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    const joined = decor.find((d) => d.family === 'cabinet' && (d.params.sections ?? []).some((s) => s.kind === 'basin') && (d.params.sections ?? []).some((s) => s.kind === 'washer'));
    expect(joined, JSON.stringify(decor.map((d) => [d.family, d.params.sections?.map((s) => s.kind)]))).toBeDefined();
    const kinds = joined!.params.sections!.map((s) => s.kind);
    expect(kinds[0] === 'washer' || kinds[kinds.length - 1] === 'washer').toBe(true);
  });

  it('builds nothing into the shower\'s tray and moves nothing into it: the tray is the shower\'s floor, not the column at its back', () => {
    const big = room('j', 'bathroom', 3.4, 2.6, [door(3, 0.8)]);
    const items = matched(big, 'modern');
    const shower = items.find((i) => i.slot === 'shower')!;
    expect(shower.areaM).toBeDefined();
    const tray = floorTaken(shower);
    expect(tray.size.width).toBeGreaterThan(shower.size.width);
    for (const level of ['balanced', 'premium'] as const) {
      const { items: out, decor } = fitBathrooms({ rooms: [big], items, catalog: CATALOG, styleId: 'modern', level });
      for (const d of decor) {
        const corners = decorFootprint(d, big);
        if (corners) expect(quadsOverlap(shrink(corners, 0.02), footprintQuad(tray)), d.id).toBe(false);
      }
      for (const i of out.filter((x) => x.elevationM < 0.05 && x.id !== shower.id && x.slot !== 'bath_mixer')) expect(quadsOverlap(footprintQuad(i), footprintQuad(tray)), i.id).toBe(false);
    }
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

  it('moves the washer beside the vanity only where it stands clear, else builds its column where the engine put it', () => {
    const big = room('j', 'bathroom', 3.4, 2.6, [door(3, 0.8)]);
    const items = matched(big, 'modern').filter((i) => i.slot !== 'shower');
    const sink = items.find((i) => i.slot === 'sink')!;
    const washer = items.find((i) => i.slot === 'washer')!;
    const moved = items.map((i) => (i.id === washer.id ? { ...washer, position: { x: sink.position.x + 1.2, z: sink.position.z }, rotation: sink.rotation } : i));
    // The floor before a radiator at the far end of the basin's wall, where the column would go.
    const strip = { minX: 3.25, maxX: 3.4, minZ: 0, maxZ: 0.45 };
    const { items: out, decor } = fitBathrooms({ rooms: [big], items: moved, catalog: CATALOG, styleId: 'modern', level: 'balanced', keepClear: { j: [strip] } });
    expect(decor.some((d) => (d.params.sections ?? []).some((s) => s.kind === 'basin') && (d.params.sections ?? []).some((s) => s.kind === 'washer'))).toBe(false);
    const placed = out.find((i) => i.slot === 'washer')!;
    expect(placed.position).toEqual(moved.find((i) => i.id === washer.id)!.position);
    expect(decor.some((d) => (d.params.sections ?? []).some((s) => s.kind === 'washer' && s.itemId === washer.id))).toBe(true);
  });

  it('builds the washer\'s column and its dryer clear of the mirror over the basin where any spot is, else hangs a mirror the catalogue has that clears the dryer', () => {
    const big = room('j', 'bathroom', 3.4, 2.6, [door(3, 0.8)]);
    const items = matched(big, 'modern').filter((i) => i.slot !== 'shower');
    const sink = items.find((i) => i.slot === 'sink')!;
    const washer = items.find((i) => i.slot === 'washer')!;
    const mirror = items.find((i) => i.slot === 'mirror')!;
    // A mirror 2.4 m wide over the basin, as the matcher may hang one (1.29 m over a 55 cm basin), out
    // over the wall's end where the column would go beside the vanity; the washer on the WC's wall,
    // past the WC and clear of the bath.
    const wide = { ...mirror, size: { ...mirror.size, width: 2.4 } };
    const away = { ...washer, position: { x: 3.4 - 0.02 - washer.size.depth / 2, z: 2.2 }, rotation: -Math.PI / 2 };
    const { items: out, decor } = fitBathrooms({ rooms: [big], items: items.map((i) => (i.id === washer.id ? away : i.id === mirror.id ? wide : i)), catalog: CATALOG, styleId: 'modern', level: 'premium' });
    const hung = out.find((i) => i.slot === 'mirror')!;
    const dryer = out.find((i) => i.slot === 'dryer')!;
    expect(dryer).toBeDefined();
    const inEachOther = quadsOverlap(shrink(footprintQuad({ ...hung, size: { ...hung.size, depth: Math.max(hung.size.depth, 0.05) } }), 0.01), footprintQuad(dryer)) && hung.elevationM < dryer.elevationM + dryer.size.height && dryer.elevationM < hung.elevationM + hung.size.height;
    expect(inEachOther).toBe(false);
    // The column is built round the machine on its own wall.
    expect(out.find((i) => i.slot === 'washer')!.rotation).toBeCloseTo(-Math.PI / 2);
    expect(decor.some((d) => (d.params.sections ?? []).some((s) => s.kind === 'washer' && s.dryer))).toBe(true);

    // The machine already under the mirror, at the end of the basin's wall: its column is built there,
    // and the wide mirror gives way to the catalogue's mirror (60 cm) that hangs clear of the dryer,
    // at a mirror's height over the basin — not lifted over the dryer, out of a person's sight.
    const under = { ...washer, position: { x: 3.4 - 0.02 - washer.size.width / 2, z: 0.02 + washer.size.depth / 2 }, rotation: sink.rotation };
    const wideProduct = product(14, 'mirror', 240, 3, 80, 'Wide wall mirror', { categorySlug: 'decor' });
    const wider = { ...wide, product: toSceneProduct(wideProduct, 1) };
    const swapped = fitBathrooms({ rooms: [big], items: items.map((i) => (i.id === washer.id ? under : i.id === mirror.id ? wider : i)), catalog: [...CATALOG, wideProduct], styleId: 'modern', level: 'premium' }).items;
    const over = swapped.find((i) => i.slot === 'mirror')!;
    const stacked = swapped.find((i) => i.slot === 'dryer')!;
    expect(stacked).toBeDefined();
    const clash = (m: PlacedItem) => quadsOverlap(shrink(footprintQuad({ ...m, size: { ...m.size, depth: Math.max(m.size.depth, 0.05) } }), 0.01), footprintQuad(stacked)) && m.elevationM < stacked.elevationM + stacked.size.height && stacked.elevationM < m.elevationM + m.size.height;
    expect(over.product?.productId).toBe(13);
    expect(clash(over)).toBe(false);
    expect(over.elevationM).toBeLessThan(stacked.elevationM + stacked.size.height);
    // With no mirror in the catalogue that clears the dryer, the mirror is kept as it hung (today's
    // clash, the owner's to rule on), never lifted out of sight.
    const kept = fitBathrooms({ rooms: [big], items: items.map((i) => (i.id === washer.id ? under : i.id === mirror.id ? wider : i)), catalog: [...CATALOG.filter((p) => p.id !== 13), wideProduct], styleId: 'modern', level: 'premium' }).items;
    const still = kept.find((i) => i.slot === 'mirror')!;
    expect(still.product?.productId).toBe(14);
    expect(still.elevationM).toBeLessThan(kept.find((i) => i.slot === 'dryer')!.elevationM + kept.find((i) => i.slot === 'dryer')!.size.height);
  });

  it('stands a freestanding bath\'s floor mixer clear: at its head, else at its other end, else a mixer on the wall', () => {
    const roomy = room('t', 'bathroom', 3.6, 2.8, [door(3, 0.8)]);
    const modern = matched(roomy, 'modern');
    const first = fitBathrooms({ rooms: [roomy], items: modern, catalog: CATALOG, styleId: 'modern', level: 'balanced' }).items.find((i) => i.slot === 'bath_mixer')!;
    const around = (m: PlacedItem) => ({ minX: m.position.x - 0.2, maxX: m.position.x + 0.2, minZ: m.position.z - 0.2, maxZ: m.position.z + 0.2 });
    // Its spot at the head is floor kept clear: it goes to the other end.
    const second = fitBathrooms({ rooms: [roomy], items: modern, catalog: CATALOG, styleId: 'modern', level: 'balanced', keepClear: { t: [around(first)] } }).items.find((i) => i.slot === 'bath_mixer')!;
    expect(second.elevationM).toBe(0);
    expect(Math.hypot(second.position.x - first.position.x, second.position.z - first.position.z)).toBeGreaterThan(1);
    // Both ends kept clear: the wall mixer over the head.
    const third = fitBathrooms({ rooms: [roomy], items: modern, catalog: CATALOG, styleId: 'modern', level: 'balanced', keepClear: { t: [around(first), around(second)] } }).items.find((i) => i.slot === 'bath_mixer')!;
    expect(third.product?.productId).toBe(11);
    expect(third.elevationM).toBeGreaterThan(0);
  });

  it('never stands the floor mixer on a piece standing at the bath\'s head: it is tested as the solid it is', () => {
    const roomy = room('t', 'bathroom', 3.6, 2.8, [door(3, 0.8)]);
    const modern = matched(roomy, 'modern');
    const first = fitBathrooms({ rooms: [roomy], items: modern, catalog: CATALOG, styleId: 'modern', level: 'balanced' }).items.find((i) => i.slot === 'bath_mixer')!;
    // A stool where the mixer would stand.
    const stool: PlacedItem = { id: 't-stool', roomId: 't', slot: 'stool', kind: 'stool', position: first.position, rotation: 0, elevationM: 0, size: { width: 0.35, depth: 0.35, height: 0.45 }, product: toSceneProduct(product(30, 'stool', 35, 35, 45, 'Wooden stool'), 1), origin: 'style' };
    const out = fitBathrooms({ rooms: [roomy], items: [...modern, stool], catalog: CATALOG, styleId: 'modern', level: 'balanced' }).items;
    const mixer = out.find((i) => i.slot === 'bath_mixer')!;
    if (mixer.elevationM < 0.05) expect(quadsOverlap(shrink(footprintQuad(mixer), 0.03), footprintQuad(stool))).toBe(false);
    expect(Math.hypot(mixer.position.x - first.position.x, mixer.position.z - first.position.z)).toBeGreaterThan(0.3);
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

describe('a basin lifted for a vanity stands on something', () => {
  const r = room('a', 'bathroom', 2.4, 2, [door(2, 0.5)]);
  const placed = (id: string, slot: PlacedItem['slot'], x: number, width: number, depth: number, height: number, elevationM: number, productId: number): PlacedItem => ({
    id, roomId: 'a', slot, kind: slot, position: { x, z: depth / 2 }, rotation: 0, elevationM, size: { width, depth, height },
    product: toSceneProduct(CATALOG.find((p) => p.id === productId)!, 1),
  });
  /** A countertop basin lifted to washing height between two towel racks, `gap` metres of wall between them. */
  const squeezed = (gap: number, basin = placed('s', 'sink', 1.2, 0.6, 0.4, 0.14, 0.72, 2)) => [
    basin,
    placed('t1', 'towel_rack', 1.2 - gap / 2 - 0.25, 0.5, 0.4, 1, 0, 2),
    placed('t2', 'towel_rack', 1.2 + gap / 2 + 0.25, 0.5, 0.4, 1, 0, 2),
  ];

  it('takes a basin that stands on the floor, at a basin\'s height, where the wall has no room for a vanity', () => {
    // 64 cm between the racks: a 60 cm basin needs a vanity 5 cm wider; the 55 cm pedestal fits.
    const { items, decor } = fitBathrooms({ rooms: [r], items: squeezed(0.64), catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    expect(decor.some((d) => d.family === 'cabinet')).toBe(false);
    const sink = items.find((i) => i.id === 's')!;
    expect(sink.product?.productId).toBe(3);
    expect(sink.elevationM).toBe(0);
    expect(Math.abs(sink.size.height - 0.85)).toBeLessThanOrEqual(0.07);
  });

  it('leaves the basin as it was where no standing basin fits either', () => {
    const { items } = fitBathrooms({ rooms: [r], items: squeezed(0.5), catalog: CATALOG, styleId: 'modern', level: 'balanced' });
    const sink = items.find((i) => i.id === 's')!;
    expect(sink.product?.productId).toBe(2);
    expect(sink.elevationM).toBe(0.72);
  });

  it('keeps a basin too tall for any vanity on the vanity that can be built: it stands on something, and it is not swapped', () => {
    const tall = [...CATALOG, product(40, 'sink', 60, 40, 30, 'Tall stone vessel basin')];
    const basin = placed('s', 'sink', 1.2, 0.6, 0.4, 0.3, 0.56, 2);
    const wide = squeezed(1.4, basin);
    // On the lowest vanity (70 cm) its top is at a metre (a rule:basin_height case, not one in the
    // air) — the standing basin in the catalogue does not take its place.
    for (const catalog of [tall, tall.filter((p) => p.id !== 3)]) {
      const out = fitBathrooms({ rooms: [r], items: wide, catalog, styleId: 'modern', level: 'balanced' });
      expect(out.decor.some((d) => d.family === 'cabinet')).toBe(true);
      const sink = out.items.find((i) => i.id === 's')!;
      expect(sink.product?.productId).toBe(2);
      expect(sink.elevationM).toBe(0.7);
    }
  });
});

describe('the joinery and the wall it stands on', () => {
  const edgeOf = (r: PlanRoom, index: number) => roomEdges(r.polygon).find((e) => e.index === index)!;
  const wc = (x: number, z: number, rotation: number): PlacedItem => ({ id: 'wc', roomId: 'w', slot: 'toilet', kind: 'toilet', position: { x, z }, rotation, elevationM: 0, size: { width: 0.36, depth: 0.5, height: 0.4 }, product: null });

  it('builds a vanity under a window whose sill is over its basin, never over a window', () => {
    const r = room('w', 'bathroom', 2.4, 2, [{ kind: 'window', wallIndex: 0, t: 0.5, widthM: 0.8, heightM: 1, sillM: 1, exterior: true }, door(2, 0.5)]);
    expect(freeStretch(r, edgeOf(r, 0), 1.2, [], [], 0.5, [], [], { top: 0.9 })).toEqual([0, 2.4]);
    expect(freeStretch(r, edgeOf(r, 0), 1.2, [], [], 0.5, [], [], { top: 1.1 })).toBeNull();
    // Tall joinery, or joinery of no stated height, keeps off it.
    expect(freeStretch(r, edgeOf(r, 0), 1.2, [], [], 0.5)).toBeNull();
  });

  it('lets a vanity come up to the 40 cm a WC on the next wall keeps beside its middle', () => {
    const r = room('w', 'bathroom', 2.4, 2, [door(2, 0.5)]);
    // A WC on the left wall (index 3), standing in front of its box, its middle 91 cm off the
    // basin's wall: a 50 cm vanity leaves it its 40 cm (and the centimetre the side room adds).
    const placed = wc(0.2 + 0.25, 0.91, Math.PI / 2);
    const stretch = freeStretch(r, edgeOf(r, 0), 0.35, [placed], [], 0.5);
    expect(stretch).not.toBeNull();
    expect(stretch![0]).toBe(0);
  });

  it('counts the 20 cm a WC will stand off its wall once its box is built', () => {
    const r = room('w', 'bathroom', 2.4, 2, [door(2, 0.5)]);
    // A WC with its back on the left wall, as the layout leaves it: once boxed its front is 70 cm
    // out, so a 65 cm column on the wall beside it stops short of it.
    const edge = edgeOf(r, 0);
    const boxedFront = 0.2 + 0.5;
    // Its side room clear of the column's depth: no concern of it.
    expect(freeStretch(r, edge, 1.6, [wc(0.25, 1.2, Math.PI / 2)], [], 0.65)![0]).toBe(0);
    const near = freeStretch(r, edge, 1.6, [wc(0.25, 0.6, Math.PI / 2)], [], 0.65)!;
    expect(near[0]).toBeCloseTo(boxedFront, 5);
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

describe('the joinery beside a WC', () => {
  it('leaves the WC its box and 40 cm either side when it fits the joinery round it', async () => {
    const { freeStretch } = await import('@/lib/design/decor/joinery');
    const r = room('j2', 'bathroom', 4.7, 2.1, [door(3, 0.5)]);
    const edge = (await import('@/lib/design/planGeometry')).roomEdges(r.polygon).find((e) => e.index === 0)!;
    const wc: PlacedItem = { id: 'wc', roomId: 'j2', slot: 'toilet', kind: 'toilet', position: { x: 1.4, z: 0.25 }, rotation: 0, elevationM: 0, size: { width: 0.36, depth: 0.47, height: 0.46 }, product: null };
    const stretch = freeStretch(r, edge, 3, [wc], [], 0.65)!;
    // The joinery starts at least 40 cm past the WC's middle.
    expect(stretch[0]).toBeGreaterThanOrEqual(1.4 + 0.4 - 1e-6);
  });

  it('stops the joinery at a shower\'s tray, not at the column standing at its back', () => {
    const r = room('s2', 'bathroom', 3, 2, [door(3, 0.5)]);
    const edge = roomEdges(r.polygon).find((e) => e.index === 0)!;
    // A 25 cm column in the corner at the wall's far end, its 90 cm tray squared round it.
    const shower: PlacedItem = { id: 'sh', roomId: 's2', slot: 'shower', kind: 'shower', position: { x: 2.55, z: 0.075 }, rotation: 0, elevationM: 0, size: { width: 0.25, depth: 0.15, height: 2.1 }, areaM: { width: 0.9, depth: 0.9 }, product: null };
    const tray = floorTaken(shower);
    expect(tray.position.z).toBeCloseTo(0.45, 5);
    expect(tray.size.width).toBe(0.9);
    // Off the tray's side by a little, the column itself 22.5 cm further on.
    const right = { ...shower, position: { x: 2.55 + 0.325, z: 0.075 } };
    expect(freeStretch(r, edge, 1.2, [right], [], 0.65)![1]).toBeCloseTo(2.875 - 0.45, 5);
    // A cabin larger than the tray it was given takes its own size.
    const cabin = floorTaken({ ...shower, size: { width: 1.26, depth: 0.97, height: 2.2 } });
    expect(cabin.size.width).toBe(1.26);
    expect(cabin.size.depth).toBe(0.97);
    expect(cabin.position.z).toBeCloseTo(0.075, 5);
    // Anything else is its own box.
    expect(floorTaken({ ...shower, slot: 'washer' })).toEqual({ position: shower.position, rotation: 0, size: shower.size });
  });

  it('drops a fix of the AI check that would stand a piece in the joinery', async () => {
    const { applyReviewFixes } = await import('@/lib/design/aiProposal');
    const r = room('k2', 'bathroom', 4.7, 2.1, [door(3, 0.5)]);
    const plan = { rooms: [r], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 } as unknown as FloorPlan;
    const wc: PlacedItem = { id: 'wc', roomId: 'k2', slot: 'toilet', kind: 'toilet', position: { x: 4.4, z: 1.2 }, rotation: -Math.PI / 2, elevationM: 0, size: { width: 0.36, depth: 0.47, height: 0.46 }, product: { productId: 1, nameKa: 'wc', slug: 'wc', brand: null, pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/m.glb', categorySlug: null, store: null } };
    const joinery = { id: 'j', roomId: 'k2', family: 'cabinet' as const, wallIndex: 0, span: { from: 0.5, to: 4.2 }, height: { from: 0, to: 1.8 }, params: { sections: [{ kind: 'basin' as const, widthMm: 3700, heightMm: 800, depthMm: 500 }] }, materials: {}, anchor: 'joinery' as const };
    const review = { model: 'm', notes: {}, fixes: [{ target: 'wc', action: 'move_to_wall' as const, productId: null, wallIndex: 0, reason: '' }] };
    const out = applyReviewFixes([wc], [joinery], review, plan, []);
    const moved = out.items.find((i) => i.id === 'wc')!;
    expect(moved.position.z).toBeGreaterThan(0.6);
  });
});
