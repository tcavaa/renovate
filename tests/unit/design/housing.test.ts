import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { fitBathrooms } from '@/lib/design/bathroom';
import { adoptHoused, cabinetAtExtent, carryHoused, followHoused, freeExtent, houseItem, housingOf } from '@/lib/design/decor/housing';
import { cornerClearance, freeStretch, sectionSpans } from '@/lib/design/decor/joinery';
import { isMovable, moveDecor, resizeDecor } from '@/lib/design/decor/resize';
import { wcBoxes } from '@/lib/design/decor/wcBox';
import { lacksHousing, settleFitted, takesHousing, withFitted } from '@/lib/design/fitted';
import { generateScene } from '@/lib/design/generateScene';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { showerGlass, withShowerArea } from '@/lib/design/shower';
import type { DecorPiece, Opening, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';
import { GENERATION_CATALOG, generationPlan } from '../../helpers/generation';

/**
 * Furniture and what is built for it travel together (`lib/design/decor/housing`, the owner's notes
 * of 13 Nov 2026): a WC and its box, a washing machine and its column, a basin and its vanity —
 * whichever of the two is moved; joinery is resized for real and never runs into a door, a piece
 * of furniture or other joinery; a piece set down from the catalogue is given what a generated one has.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
function room(openings: Array<Omit<Opening, 'roomId' | 'id'>> = [], type: PlanRoom['type'] = 'bathroom', w = 3, d = 2.5): PlanRoom {
  return refreshRoom({ id: 'b', type, name: 'b', polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `o${i}`, roomId: 'b' })) });
}
const door = (wallIndex: number, t: number, widthM = 0.7): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM, heightM: 2.05, sillM: 0, exterior: false });
const sceneProduct = (id: number, name: string) => ({ productId: id, nameKa: name, nameEn: name, slug: `p-${id}`, brand: null, pricePerUnit: 100, unit: 'piece', qty: 1, totalPrice: 100, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: `/m/${id}.glb`, categorySlug: 'sanitary', store: null });
function item(id: string, slot: PlacedItem['slot'], x: number, z: number, size: PlacedItem['size'], rotation = 0, elevationM = 0): PlacedItem {
  return { id, roomId: 'b', slot, kind: slot, position: P(x, z), rotation, elevationM, size, product: sceneProduct(1, slot) };
}
/** A washing machine with its back 2 cm off wall 0, a WC in front of its 20 cm box, a basin as it stands on a vanity. */
const washer = (x: number, z = 0.295, rotation = 0) => item('w', 'washer', x, z, { width: 0.6, depth: 0.55, height: 0.85 }, rotation);
const wc = (x: number, z = 0.54, rotation = 0) => item('wc', 'toilet', x, z, { width: 0.4, depth: 0.68, height: 0.82 }, rotation);
const basin = (x: number) => item('s', 'sink', x, 0.25, { width: 0.6, depth: 0.4, height: 0.14 });
const spanOf = (piece: Pick<DecorPiece, 'span'>) => [piece.span.from, piece.span.to];

describe('a WC and its box', () => {
  const r = room();
  const box = wcBoxes([r], [wc(1.5)], [])[0];

  it('names its WC and follows it along the wall, onto another wall, and out in front of it', () => {
    expect(box.itemId).toBe('wc');
    expect(followHoused([box], [wc(1.5)], [r]).decor[0]).toBe(box);
    const along = followHoused([box], [wc(2.2)], [r]);
    expect(spanOf(along.decor[0])).toEqual([1.8, 2.6]);
    // Onto the west wall (index 3, running from the far corner back): its box goes there, and the
    // WC, set down with its back on the wall, is stood out in front of the box.
    const moved = followHoused([box], [wc(0.34, 1.2, Math.PI / 2)], [r]);
    expect(moved.decor[0].wallIndex).toBe(3);
    expect(spanOf(moved.decor[0])).toEqual([0.9, 1.7]);
    expect(moved.items[0].position.x).toBeCloseTo(0.54, 3);
    // Out in the room it has no wall behind it: its box waits where it is.
    expect(followHoused([box], [wc(1.5, 1.4)], [r]).decor[0]).toBe(box);
  });

  it('goes with its WC when the WC is deleted, and moves its WC when it is moved', () => {
    expect(followHoused([box], [], [r]).decor).toEqual([]);
    const slid = { ...box, span: { from: 1.6, to: 2.4 } };
    expect(carryHoused(box, slid, [wc(1.5)], [r])[0].position).toEqual(P(2, 0.54));
  });

  it('is given to a WC set down from the catalogue, once', () => {
    const fitted = withFitted('wc', [r], [wc(1.5, 0.36)], [], 'vintage')!;
    expect(fitted.decor).toHaveLength(1);
    expect(fitted.decor[0].itemId).toBe('wc');
    // Stood out of its box.
    expect(fitted.items[0].position.z).toBeCloseTo(0.54, 3);
    expect(withFitted('wc', [r], fitted.items, fitted.decor, 'vintage')).toBeNull();
    expect(lacksHousing(fitted.items[0], fitted.decor)).toBe(false);
    expect(lacksHousing(wc(1.5), [])).toBe(true);
  });
});

describe('a washing machine and its column', () => {
  const r = room();
  const built = houseItem(washer(1), [r], [washer(1)], [])!;
  const column = built.decor[0];

  it('is built round the machine: its width and its sides, 65 cm deep, the machine named', () => {
    expect(column.family).toBe('cabinet');
    expect(spanOf(column)).toEqual([0.672, 1.328]);
    expect(sectionSpans(column)[0].section).toMatchObject({ kind: 'washer', widthMm: 656, heightMm: 880, depthMm: 650, itemId: 'w' });
    expect(housingOf('w', built.decor)?.section).toBe(0);
  });

  it('goes where the machine goes — along the wall, to the wall’s end when a sliver away, onto another wall — and keeps its id', () => {
    const along = followHoused(built.decor, [washer(2)], [r]);
    expect(along.decor).toHaveLength(1);
    expect(along.decor[0].id).toBe(column.id);
    expect(spanOf(along.decor[0])).toEqual([1.672, 2.328]);
    // 7 cm short of the corner: the column goes to the corner and the machine with it (BA-14).
    const corner = followHoused(built.decor, [washer(2.6)], [r]);
    expect(spanOf(corner.decor[0])).toEqual([2.344, 3]);
    expect(corner.items[0].position.x).toBeCloseTo(2.672, 3);
    // Onto the far wall (index 2, running back from x = 3), the machine turned to face the room.
    const far = followHoused(built.decor, [washer(1.5, 2.205, Math.PI)], [r]);
    expect(far.decor[0].wallIndex).toBe(2);
    expect(spanOf(far.decor[0])).toEqual([1.172, 1.828]);
  });

  it('is given up where the machine has no wall behind it or the column no room, and goes with a deleted machine', () => {
    expect(followHoused(built.decor, [washer(1.5, 1.3)], [r]).decor).toEqual([]);
    expect(followHoused(built.decor, [], [r]).decor).toEqual([]);
    // Between a WC's 80 cm and the corner there is no 65.6 cm.
    const tight = followHoused(built.decor, [washer(0.31), wc(1.05)], [r]);
    expect(tight.decor).toEqual([]);
  });

  it('carries its dryer and the machine when the column itself is moved', () => {
    const dryer = item('w-dryer', 'dryer', 1, 0.33, { width: 0.6, depth: 0.62, height: 0.86 }, 0, 0.88);
    const slid = { ...column, span: { from: 2, to: 2.656 } };
    const items = carryHoused(column, slid, [washer(1), dryer], [r]);
    expect(items.find((i) => i.id === 'w')!.position.x).toBeCloseTo(2.328, 3);
    expect(items.find((i) => i.id === 'w-dryer')!.position.x).toBeCloseTo(2.328, 3);
    expect(items.find((i) => i.id === 'w-dryer')!.elevationM).toBe(0.88);
  });

  it('is not built unasked in a Vintage flat, whose machine stands free — but the card builds it', () => {
    expect(takesHousing(washer(1), r, 'vintage')).toBe(false);
    expect(withFitted('w', [r], [washer(1)], [], 'vintage')).toBeNull();
    expect(withFitted('w', [r], [washer(1)], [], 'vintage', undefined, true)?.decor).toHaveLength(1);
    expect(takesHousing(washer(1), r, 'modern')).toBe(true);
  });
});

describe('a basin and its vanity', () => {
  const r = room();
  const built = houseItem(basin(1.5), [r], [basin(1.5)], [])!;
  const vanity = built.decor[0];

  it('stands under the basin: a metre wide, its top 76 cm with the basin on it', () => {
    expect(spanOf(vanity)).toEqual([1, 2]);
    expect(vanity.height.to).toBe(0.76);
    expect(built.items[0].elevationM).toBe(0.76);
    expect(built.items[0].position).toEqual(P(1.5, 0.25));
  });

  it('made taller by its top arrow, lifts the basin and its tap; made wider, keeps the basin where it stood', () => {
    const tap = item('s-tap', 'tap', 1.5, 0.04, { width: 0.15, depth: 0.18, height: 0.28 }, 0, 0.76);
    const items = [...built.items, tap];
    const taller = cabinetAtExtent(vanity, { span: vanity.span, height: { from: 0, to: 0.85 } }, items);
    expect(sectionSpans(taller)[0].section.heightMm).toBe(850);
    expect(taller.height.to).toBe(0.85);
    const lifted = carryHoused(vanity, taller, items, [r]);
    expect(lifted.find((i) => i.id === 's')!.elevationM).toBe(0.85);
    expect(lifted.find((i) => i.id === 's-tap')!.elevationM).toBeCloseTo(0.85, 3);
    const wider = cabinetAtExtent(vanity, { span: { from: 1, to: 2.6 }, height: vanity.height }, items);
    expect(sectionSpans(wider)[0].section.widthMm).toBe(1600);
    expect(carryHoused(vanity, wider, items, [r]).find((i) => i.id === 's')!.position.x).toBe(1.5);
    // Never narrower than its basin.
    const narrow = cabinetAtExtent(vanity, { span: { from: 1, to: 1.3 }, height: vanity.height }, items);
    expect(sectionSpans(narrow)[0].section.widthMm).toBe(650);
  });

  it('slid along the wall by hand, takes the basin with it', () => {
    const place = moveDecor(vanity, r, 0, 1.8, 0)!;
    expect(spanOf(place)).toEqual([1.8, 2.8]);
    // Joinery stays on the floor whatever the pointer's height.
    expect(moveDecor(vanity, r, 0, 1.8, 1.2)!.height).toEqual({ from: 0, to: 0.76 });
    const slid = { ...vanity, span: place.span };
    expect(carryHoused(vanity, slid, built.items, [r])[0].position).toEqual(P(2.3, 0.25));
    // The card's distance from the wall's start slides it the same way.
    expect(spanOf(resizeDecor(vanity, r, { leftM: 0.4 })!)).toEqual([0.4, 1.4]);
  });

  it('is built unasked only under a countertop basin in a bathroom', () => {
    expect(takesHousing(basin(1.5), r, 'modern')).toBe(true);
    expect(takesHousing({ ...basin(1.5), size: { width: 0.55, depth: 0.45, height: 0.86 } }, r, 'modern')).toBe(false);
    expect(takesHousing(basin(1.5), room([], 'kitchen'), 'modern')).toBe(false);
  });
});

describe('one piece of joinery with a vanity and a column', () => {
  const r = room();
  const piece: DecorPiece = {
    id: 'run',
    roomId: 'b',
    family: 'cabinet',
    wallIndex: 0,
    span: { from: 0.5, to: 2.556 },
    height: { from: 0, to: 1.78 },
    params: {
      sections: [
        { kind: 'basin', widthMm: 1000, heightMm: 760, depthMm: 500, itemId: 's' },
        { kind: 'doors', widthMm: 400, heightMm: 760, depthMm: 500 },
        { kind: 'washer', widthMm: 656, heightMm: 1780, depthMm: 650, itemId: 'w' },
      ],
    },
    materials: {},
    anchor: 'joinery',
  };
  const items = [{ ...basin(1), elevationM: 0.76 }, washer(2.228)];

  it('stays as it is while both stand in it', () => {
    const settled = followHoused([piece], items, [r]);
    expect(settled.decor).toEqual([piece]);
    expect(settled.items).toEqual(items);
  });

  it('lets the column go with the machine and closes up', () => {
    const moved = followHoused([piece], [items[0], washer(1.5, 2.205, Math.PI)], [r]);
    expect(moved.decor).toHaveLength(2);
    const rest = moved.decor.find((d) => d.id === 'run')!;
    expect(spanOf(rest)).toEqual([0.5, 1.9]);
    expect(sectionSpans(rest).map((s) => s.section.kind)).toEqual(['basin', 'doors']);
    expect(rest.height.to).toBe(0.76);
    const column = moved.decor.find((d) => d.id !== 'run')!;
    expect(column.wallIndex).toBe(2);
    // The column keeps the height it had in the run.
    expect(sectionSpans(column)[0].section).toMatchObject({ kind: 'washer', heightMm: 1780, itemId: 'w' });
  });

  it('resized from its top, raises the column and leaves the vanity; from its side, stretches the vanity and not the column', () => {
    const taller = cabinetAtExtent(piece, { span: piece.span, height: { from: 0, to: 2.1 } }, items);
    expect(sectionSpans(taller).map((s) => s.section.heightMm)).toEqual([760, 760, 2100]);
    const wider = cabinetAtExtent(piece, { span: { from: 0.5, to: 2.856 }, height: piece.height }, items);
    const widths = sectionSpans(wider).map((s) => s.section.widthMm);
    expect(widths[2]).toBe(656);
    expect(widths[0] + widths[1]).toBe(1700);
    // The column is never lower than the machine in it.
    const low = cabinetAtExtent(piece, { span: piece.span, height: { from: 0, to: 0.5 } }, items);
    expect(sectionSpans(low)[2].section.heightMm).toBe(880);
  });

  it('takes its link from where the pieces stand when it was saved before joinery named them', () => {
    const bare: DecorPiece = { ...piece, params: { sections: piece.params.sections!.map(({ itemId: _id, ...s }) => s) } };
    const adopted = adoptHoused([bare], items, [r]);
    expect(adopted[0].params.sections!.map((s) => s.itemId)).toEqual(['s', undefined, 'w']);
    expect(adoptHoused(adopted, items, [r])).toBe(adopted);
  });
});

describe('joinery never runs into anything', () => {
  const r = room([door(0, 0.8)]);
  const column = houseItem(washer(1), [r], [washer(1)], [])!.decor[0];

  it('is not moved onto a door, and stops at it', () => {
    // The door is 2.05–2.75 m along the wall, 5 cm kept round it.
    expect(freeExtent(column, { span: { from: 2, to: 2.656 }, height: column.height }, 0, r, [washer(1)], [column], true)).toBeNull();
    const place = freeExtent(column, { span: { from: 1.5, to: 2.156 }, height: column.height }, 0, r, [washer(1)], [column], true)!;
    expect(spanOf(place)).toEqual([1.344, 2]);
  });

  it('stops at other joinery and at furniture when it is moved or made wider', () => {
    const other: DecorPiece = { ...column, id: 'other', span: { from: 1.5, to: 2 }, params: { sections: [{ kind: 'doors', widthMm: 500, heightMm: 2000, depthMm: 600 }] } };
    const all = [column, other];
    expect(spanOf(freeExtent(column, { span: { from: 1, to: 1.656 }, height: column.height }, 0, r, [washer(1)], all, true)!)).toEqual([0.844, 1.5]);
    expect(spanOf(freeExtent(column, { span: { from: 0.672, to: 1.9 }, height: column.height }, 0, r, [washer(1)], all, false)!)).toEqual([0.672, 1.5]);
    // A WC keeps 41 cm either side of its middle: the column grows that far short of it.
    expect(spanOf(freeExtent(column, { span: { from: 0.672, to: 1.9 }, height: column.height }, 0, r, [washer(1), wc(1.9)], [column], false)!)).toEqual([0.672, 1.49]);
    // Slats are flat on the wall: they go where they are put.
    const slats: DecorPiece = { ...column, id: 'slats', family: 'slats', params: {}, span: { from: 0.2, to: 1.2 }, height: { from: 0.5, to: 2 } };
    const anywhere = { span: { from: 1.9, to: 2.9 }, height: { from: 0.5, to: 2 } };
    expect(freeExtent(slats, anywhere, 0, r, [washer(1)], all, true)).toBe(anywhere);
  });

  it('keeps off a corner whose other wall has a door within its depth', () => {
    // A door 5–75 cm from the corner on the wall round it: 65 cm of joinery would stand across it.
    const cornered = room([door(1, 0.16)]);
    const edge = roomEdges(cornered.polygon)[0];
    expect(cornerClearance(cornered, edge, 0.65)).toEqual([0, 2.1]);
    expect(freeStretch(cornered, edge, 1.5, [], [], 0.65)).toEqual([0, 2.1]);
    // What already stands in that corner keeps its cupboard.
    expect(freeStretch(cornered, edge, 2.6, [], [], 0.65)).toEqual([0, 3]);
  });
});

describe('decor moved by hand', () => {
  const r = room();
  const slats: DecorPiece = { id: 'd', roomId: 'b', family: 'slats', wallIndex: 0, span: { from: 0.5, to: 1.5 }, height: { from: 1, to: 2.4 }, params: {}, materials: {}, anchor: 'bed' };

  it('slides along its wall and up it, kept on the wall and under the ceiling, and hops onto another wall', () => {
    expect(moveDecor(slats, r, 0, 1.2, 0.4)).toEqual({ wallIndex: 0, span: { from: 1.2, to: 2.2 }, height: { from: 0.4, to: 1.8 } });
    expect(moveDecor(slats, r, 0, 2.6, 2)).toEqual({ wallIndex: 0, span: { from: 2, to: 3 }, height: { from: 1.3, to: 2.7 } });
    // The side wall is 2.5 m long.
    expect(moveDecor(slats, r, 1, 2.2, 1)).toEqual({ wallIndex: 1, span: { from: 1.5, to: 2.5 }, height: { from: 1, to: 2.4 } });
    expect(moveDecor(slats, r, 9, 1, 1)).toBeNull();
  });

  it('is not for a ceiling cove or a kitchen’s corner leg', () => {
    expect(isMovable(slats)).toBe(true);
    expect(isMovable({ ...slats, family: 'light', wallIndex: null })).toBe(false);
    expect(isMovable({ ...slats, family: 'cabinet', params: { corner: 'left' } })).toBe(false);
  });
});

describe('a shower set down from the catalogue', () => {
  it('is given its floor and its glass', () => {
    const column = item('sh', 'shower', 0.45, 0.075, { width: 0.25, depth: 0.15, height: 2.1 });
    expect(showerGlass(column, room())).toEqual([]);
    const shower = withShowerArea(column);
    expect(shower.areaM).toEqual({ width: 0.9, depth: 0.9 });
    // In a corner: glass on the two sides that are not on a wall.
    expect(showerGlass(shower, room())).toHaveLength(2);
    expect(withShowerArea(shower)).toBe(shower);
    expect(lacksHousing(column, [])).toBe(true);
    expect(withFitted('sh', [room()], [column], [], 'modern')!.items[0].areaM).toEqual({ width: 0.9, depth: 0.9 });
  });
});

describe('a generated flat', () => {
  it('is left as it is by the pass that keeps housings with their furniture', () => {
    const scene = generateScene({ plan: generationPlan(), styleId: 'modern', budgetGel: null, catalog: GENERATION_CATALOG, proposal: null, finishes: [], electrical: [], seed: 4242, at: '2026-11-13T00:00:00.000Z', aiCount: 0 });
    const settled = settleFitted(scene.decor, scene.items, scene.plan.rooms);
    expect(settled.items).toEqual(scene.items);
    expect(settled.decor).toEqual(scene.decor);
  });

  it('names the furniture in every vanity and column the bathroom pass builds, and the pass leaves them be', () => {
    const product = (id: number, kind: string, w: number, d: number, h: number, nameEn: string, extra: Partial<CatalogProduct> = {}): CatalogProduct =>
      ({ id, nameKa: nameEn, nameEn, nameRu: null, slug: `p-${id}`, brand: null, categorySlug: 'sanitary', categoryId: null, pricePerUnit: 100, unit: 'piece', imageUrl: null, colorHex: '#ffffff', textureUrl: null, model3dKind: kind, model3dUrl: `/m/${id}.glb`, widthCm: w, depthCm: d, heightCm: h, styleTags: ['modern'], tags: null, isFeatured: false, specs: null, coveragePerUnit: null, store: null, ...extra }) as CatalogProduct;
    const catalog = [product(1, 'toilet', 36, 54, 40, 'Wall-hung WC'), product(2, 'sink', 60, 40, 14, 'Rectangular countertop basin'), product(4, 'tap', 15, 18, 28, 'Basin mixer'), product(6, 'washer', 60, 55, 85, 'Washing machine'), product(12, 'shower', 25, 15, 210, 'Shower column')];
    const bath = refreshRoom({ id: 'b', type: 'bathroom', name: 'b', polygon: [P(0, 0), P(2.6, 0), P(2.6, 2.4), P(0, 2.4)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [{ id: 'o', roomId: 'b', kind: 'door', wallIndex: 2, t: 0.5, widthM: 0.7, heightM: 2.05, sillM: 0, exterior: false }] });
    const items = matchProducts(layoutRoom(bath, {}), catalog, { styleId: 'modern', budgetGel: null, rooms: [bath] }).filter((i) => i.product);
    const fitted = fitBathrooms({ rooms: [bath], items, catalog, styleId: 'modern', level: 'balanced' });
    const linked = fitted.decor.flatMap((d) => d.params.sections ?? []).filter((s) => s.itemId);
    expect(linked.length).toBeGreaterThan(0);
    for (const section of linked) expect(fitted.items.some((i) => i.id === section.itemId)).toBe(true);
    const settled = followHoused(fitted.decor, fitted.items, [bath]);
    expect(settled.decor).toEqual(fitted.decor);
    expect(settled.items).toEqual(fitted.items);
  });
});

describe('cupboards move with their furniture like furniture', () => {
  const r = room();
  const vanity: DecorPiece = {
    id: 'v',
    roomId: 'b',
    family: 'cabinet',
    wallIndex: 0,
    span: { from: 0.5, to: 1.9 },
    height: { from: 0, to: 0.76 },
    params: { sections: [{ kind: 'doors', widthMm: 400, heightMm: 760, depthMm: 500 }, { kind: 'basin', widthMm: 1000, heightMm: 760, depthMm: 500, itemId: 's' }] },
    materials: {},
    anchor: 'joinery',
  };
  const onTop = (x: number): PlacedItem => ({ ...basin(x), elevationM: 0.76 });

  it('leaves the vanity as it is when the basin is moved about on its top (it used to shrink to the basin)', () => {
    // Over the plain doors beside its own section: still on the same top.
    const moved = followHoused([vanity], [onTop(0.9)], [r]);
    expect(moved.decor).toEqual([vanity]);
    expect(moved.items).toEqual([onTop(0.9)]);
  });

  it('takes the whole vanity, every section, to the wall its basin is set down at', () => {
    const far: PlacedItem = { ...onTop(1.5), position: P(1.5, 2.25), rotation: Math.PI };
    const moved = followHoused([vanity], [far], [r]);
    expect(moved.decor).toHaveLength(1);
    expect(moved.decor[0]).toMatchObject({ id: 'v', wallIndex: 2, span: { from: 0.6, to: 2 } });
    expect(sectionSpans(moved.decor[0]).map((s) => s.section.kind)).toEqual(['doors', 'basin']);
    expect(moved.items[0].elevationM).toBe(0.76);
  });

  it('turns a machine set down by another wall to stand with its back on it, and brings its column', () => {
    const column = houseItem(washer(1), [r], [washer(1)], [])!.decor;
    // Dragged to the east wall still facing the way it faced.
    const moved = followHoused(column, [washer(2.65, 1.2)], [r]);
    expect(moved.decor).toHaveLength(1);
    expect(moved.decor[0].wallIndex).toBe(1);
    expect(Math.sin(moved.items[0].rotation)).toBeCloseTo(-1, 6);
    expect(moved.items[0].position.x).toBeCloseTo(3 - 0.295, 3);
    // A WC set down by the west wall turns to it too, its box behind it.
    const box = wcBoxes([r], [wc(1.5)], []);
    const turned = followHoused(box, [wc(0.5, 1.2)], [r]);
    expect(turned.decor[0].wallIndex).toBe(3);
    expect(Math.sin(turned.items[0].rotation)).toBeCloseTo(1, 6);
  });
});
