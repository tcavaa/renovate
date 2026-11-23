import { describe, expect, it } from 'vitest';
import { placeFurniturePicks } from '@/lib/design/fromCalculator';
import { pickPoses, pickStatuses, unplacedPicksOf, yieldsToPick } from '@/lib/design/pickFit';
import { refreshRoom } from '@/lib/design/planGeometry';
import { getArchetype } from '@/lib/design/catalog';
import { footprintInRoom, footprintOf, footprintsOverlap } from '@/lib/design/manipulate';
import { candidatesFor, workingFloor, type CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';
import { designSceneSchema } from '@/lib/validations/design.schema';
import { generateScene } from '@/lib/design/generateScene';
import { LIES_FLAT } from '@/lib/design/kinds';
import { tucksUnder } from '@/lib/design/relations';
import { footprintQuad, quadsOverlap } from '@/lib/design/rules';
import { generatedFlat, runSeed } from '../../helpers/generationAudit';
import { fixtureCatalog, fixturePlans } from '../../helpers/generationFixtures';

/**
 * A calculator pick that does not fit where it was picked for (Nini's decision 13): another place
 * in its room, the room's secondary pieces making way, another room of its type, else left out of
 * the 3D and listed — never out of the room, in another piece or at another size.
 */

const furniture = (id: number, kind: string, widthCm: number, depthCm: number, heightCm: number): CatalogProduct =>
  ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm, depthCm, heightCm, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as CatalogProduct;
const room = (id: string, type: PlanRoom['type'], x: number, w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x, z: 0 }, { x: x + w, z: 0 }, { x: x + w, z: d }, { x, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
const planOf = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 20, depth: 10 }, source: 'manual', wallThicknessM: 0.12 });
const piece = (id: string, roomId: string, p: CatalogProduct, x: number, z: number, rotation = 0, patch: Partial<PlacedItem> = {}): PlacedItem => ({
  id,
  roomId,
  slot: getArchetype(p.model3dKind!)!.slot,
  kind: p.model3dKind!,
  position: { x, z },
  rotation,
  elevationM: 0,
  size: { width: p.widthCm! / 100, depth: p.depthCm! / 100, height: p.heightCm! / 100 },
  product: { productId: p.id, nameKa: p.nameKa, slug: p.slug, brand: null, pricePerUnit: 500, unit: 'piece', qty: 1, totalPrice: 500, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: p.model3dUrl, categorySlug: p.categorySlug, store: null },
  origin: 'style',
  ...patch,
});
const box = (i: PlacedItem) => footprintOf(i.position, i.size, i.rotation);
const floorClashes = (list: PlacedItem[], item: PlacedItem) => list.filter((o) => o.id !== item.id && o.roomId === item.roomId && o.elevationM < 0.05 && footprintsOverlap(box(item), box(o), 0.01));

describe('another place in its room', () => {
  // A kitchen 3 × 3 m, its run along wall 0: the spot a bookshelf's rule gives it stands on the
  // run's working floor, so it is stood elsewhere in the room, its back to a wall.
  const kitchen = room('k', 'kitchen', 0, 3, 3);
  const run: PlacedItem = { ...piece('run', 'k', furniture(1, 'kitchen_run', 300, 60, 90), 1.5, 0.3), custom: true };
  const shelf = furniture(7, 'bookshelf', 80, 40, 120);

  it('is tried, at its own size, before anything in the room is moved for it', () => {
    const { items: next, outcomes } = placeFurniturePicks([run], planOf(kitchen), { furniture: [{ roomId: 'k', productId: 7 }], productIds: [] }, [shelf], { keepClear: { k: [] } });
    const placed = next.find((i) => i.product?.productId === 7)!;
    expect(outcomes[0]).toMatchObject({ step: 'turned', itemId: placed.id, placedIn: null });
    expect(outcomes[0].moved).toBeUndefined();
    expect(placed.size).toEqual({ width: 0.8, depth: 0.4, height: 1.2 });
    expect(footprintInRoom(box(placed), kitchen.polygon)).toBe(true);
    expect(footprintsOverlap(box(placed), workingFloor(run), 0.01)).toBe(false);
    expect(next.find((i) => i.id === 'run')).toEqual(run);
  });
});

describe('a pick that fits nowhere as it is', () => {
  /**
   * A living room 3 × 3 m. Wall 0 (z = 0): the style's sofa (2 m) and a bookshelf in the corner;
   * wall 2: a wardrobe; wall 3: a desk. A 2.8 m sofa stands nowhere but along wall 0, and there
   * only where the bookshelf is — the one secondary piece in its way.
   */
  const liv = room('liv', 'living_room', 0, 3, 3);
  const styleSofa = furniture(1, 'sofa_3seat', 200, 90, 84);
  const shelf = furniture(2, 'bookshelf', 80, 35, 180);
  const wardrobe = furniture(3, 'wardrobe', 180, 62, 225);
  const desk = furniture(4, 'desk', 140, 70, 75);
  const longSofa = furniture(10, 'sofa_3seat', 280, 95, 85);
  const items = [
    piece('sofa', 'liv', styleSofa, 1.1, 0.45),
    piece('shelf', 'liv', shelf, 2.6, 0.175),
    piece('wardrobe', 'liv', wardrobe, 1.5, 3 - 0.31, Math.PI),
    piece('desk', 'liv', desk, 0.35, 1.68, Math.PI / 2),
  ];
  const catalog = [styleSofa, shelf, wardrobe, desk, longSofa];
  const pick = (options = {}) => placeFurniturePicks(items, planOf(liv), { furniture: [{ roomId: 'liv', productId: 10 }], productIds: [] }, catalog, options);

  it('has the room’s secondary pieces make way for it — the bookshelf, never the wardrobe or the desk', () => {
    const { items: next, outcomes } = pick();
    const sofa = next.find((i) => i.product?.productId === 10)!;
    expect(outcomes[0].step).toBe('rearranged');
    expect(outcomes[0].itemId).toBe(sofa.id);
    expect([...(outcomes[0].moved ?? []), ...(outcomes[0].swapped ?? []), ...(outcomes[0].removed ?? [])]).toEqual(['shelf']);
    // At its own size, inside the room, in no other piece.
    expect(sofa.size).toEqual({ width: 2.8, depth: 0.95, height: 0.85 });
    expect(footprintInRoom(box(sofa), liv.polygon)).toBe(true);
    expect(floorClashes(next, sofa)).toEqual([]);
    expect(next.find((i) => i.id === 'wardrobe')).toEqual(items[2]);
    expect(next.find((i) => i.id === 'desk')).toEqual(items[3]);
    // The bookshelf, where it went, stands clear too.
    const moved = next.find((i) => i.id === 'shelf');
    if (moved) expect(floorClashes(next, moved)).toEqual([]);
  });

  it('in the studio leaves the flat the person has as it is, and the pick out', () => {
    const { items: next, outcomes } = pick({ rearrange: false });
    expect(outcomes[0]).toEqual({ roomId: 'liv', productId: 10, step: 'unplaced', itemId: null, placedIn: null });
    expect(next).toEqual(items);
  });
});

describe('another room of the same type', () => {
  const small = room('a', 'bedroom', 0, 1.7, 1.7);
  const large = room('b', 'bedroom', 5, 4, 4);
  const bed = furniture(20, 'bed_double', 180, 210, 100);

  it('takes the pick when its own room has no place for it, and says which room it was picked for', () => {
    const { items: next, outcomes } = placeFurniturePicks([], planOf(small, large), { furniture: [{ roomId: 'a', productId: 20 }], productIds: [] }, [bed]);
    const placed = next.find((i) => i.product?.productId === 20)!;
    expect(placed.roomId).toBe('b');
    expect(placed.pickedFor).toBe('a');
    expect(placed.origin).toBe('calculator');
    expect(footprintInRoom(box(placed), large.polygon)).toBe(true);
    expect(outcomes[0]).toMatchObject({ roomId: 'a', step: 'other_room', placedIn: 'b', itemId: placed.id });
    // Put in again, the room it was picked for holds it: not placed twice.
    const again = placeFurniturePicks(next, planOf(small, large), { furniture: [{ roomId: 'a', productId: 20 }], productIds: [] }, [bed]);
    expect(again.items).toEqual(next);
    expect(again.outcomes[0].step).toBe('held');
  });

  it('none of another type: a bedroom’s bed does not go into the living room', () => {
    const liv = room('b', 'living_room', 5, 4, 4);
    const { items: next, outcomes } = placeFurniturePicks([], planOf(small, liv), { furniture: [{ roomId: 'a', productId: 20 }], productIds: [] }, [bed]);
    expect(next).toEqual([]);
    expect(outcomes[0].step).toBe('unplaced');
    expect(unplacedPicksOf(outcomes)).toEqual([{ roomId: 'a', productId: 20 }]);
  });
});

describe('what gives way to a pick', () => {
  const liv = room('liv', 'living_room', 0, 4, 4);
  const kitchen = room('k', 'kitchen', 5, 4, 4);
  const at = (kind: string, roomId = 'liv', patch: Partial<PlacedItem> = {}) => piece(`${roomId}-${kind}`, roomId, furniture(1, kind, 60, 60, 80), 1, 1, 0, patch);

  it('the engine’s secondary pieces, not what the room is for nor anybody’s choice', () => {
    expect(yieldsToPick(at('coffee_table'), liv, [])).toBe(true);
    expect(yieldsToPick(at('armchair'), liv, [])).toBe(true);
    expect(yieldsToPick(at('sofa_3seat'), liv, [])).toBe(false);
    expect(yieldsToPick(at('tv_unit'), liv, [])).toBe(false);
    expect(yieldsToPick(at('coffee_table', 'liv', { origin: 'studio' }), liv, [])).toBe(false);
    expect(yieldsToPick(at('coffee_table', 'liv', { origin: 'calculator' }), liv, [])).toBe(false);
    expect(yieldsToPick(at('coffee_table', 'liv', { locked: true }), liv, [])).toBe(false);
    // A living room's dining table gives way; a kitchen's is one of its must-haves.
    expect(yieldsToPick(at('dining_table'), liv, [])).toBe(true);
    expect(yieldsToPick(at('dining_table', 'k'), kitchen, [])).toBe(false);
  });

  it('nothing a pick stands at: the table of a picked chair stays', () => {
    const table = at('dining_table');
    const chair = { ...at('dining_chair'), origin: 'calculator' as const };
    expect(yieldsToPick(table, liv, [table, chair])).toBe(false);
  });
});

describe('every other place in a room', () => {
  const r = room('r', 'bedroom', 0, 4, 3);

  it('stands its back to each wall inside the room, the nearest first; a bed its side too', () => {
    const poses = pickPoses(r, 'dresser', { width: 1, depth: 0.5 }, { x: 3.5, z: 0.25 });
    expect(poses.length).toBeGreaterThan(20);
    for (const pose of poses) expect(footprintInRoom(footprintOf(pose.position, { width: 1, depth: 0.5 }, pose.rotation), r.polygon)).toBe(true);
    expect(Math.hypot(poses[0].position.x - 3.5, poses[0].position.z - 0.25)).toBeLessThan(0.06);
    const bed = pickPoses(r, 'bed', { width: 1.6, depth: 2.05 }, { x: 2, z: 1 });
    expect(bed.length).toBeGreaterThan(pickPoses(r, 'wardrobe', { width: 1.6, depth: 2.05 }, { x: 2, z: 1 }).length);
  });
});

describe('the picks as the studio lists them', () => {
  const sofa = furniture(10, 'sofa_3seat', 280, 95, 85);
  const bed = furniture(20, 'bed_double', 180, 210, 100);
  const placedSofa = piece('s', 'liv', sofa, 1, 1, 0, { origin: 'calculator' });
  const movedBed = piece('b', 'bed2', bed, 6, 1, 0, { origin: 'calculator', pickedFor: 'bed1' });
  const picks = [
    { roomId: 'liv', productId: 10 },
    { roomId: 'bed1', productId: 20 },
    { roomId: 'liv', productId: 30 },
    { roomId: 'liv', productId: 40 },
  ];

  it('in its room, moved to another, or not in the 3D — because it fitted nowhere, or it was taken out since', () => {
    const rows = pickStatuses(picks, [placedSofa, movedBed], { unplacedPicks: [{ roomId: 'liv', productId: 30 }] });
    expect(rows.map((r) => [r.state, r.itemId, r.placedIn, r.reason])).toEqual([
      ['placed', 's', null, null],
      ['moved', 'b', 'bed2', null],
      ['unplaced', null, null, 'no_fit'],
      ['unplaced', null, null, 'removed'],
    ]);
  });

  it('keep across a save: a moved pick’s room and the picks left out pass the scene’s schema', () => {
    const scene = { styleId: 'modern', mode: 'full', budgetGel: null, items: [movedBed], finishes: [], generation: { by: 'engine', at: '2026-11-24T00:00:00.000Z', unplacedPicks: [{ roomId: 'liv', productId: 30 }, { roomId: null, productId: 41 }] } };
    const parsed = designSceneSchema.parse(scene);
    expect(parsed.items[0].pickedFor).toBe('bed1');
    expect(parsed.generation?.unplacedPicks).toEqual([{ roomId: 'liv', productId: 30 }, { roomId: null, productId: 41 }]);
  });
});

describe('at generation, over a real plan and catalogue', () => {
  it('no pick stands out of its room or in another piece; those left out are in the generation record', () => {
    const catalog = fixtureCatalog();
    const { plan } = fixturePlans().find((p) => p.id === 'sample')!;
    const base = generatedFlat('sample', plan, catalog, 'modern', 1);
    // Every floor piece of the flat picked again in the largest product of its kind, and the largest sofa for every room.
    const largest = (kind: string) => candidatesFor(kind, catalog, 'modern').filter((p) => p.model3dKind === kind && p.widthCm && p.depthCm).sort((a, b) => b.widthCm! * b.depthCm! - a.widthCm! * a.depthCm!)[0];
    const furniture = [
      ...base.items.filter((i) => i.elevationM < 0.05 && i.product && largest(i.kind)).map((i) => ({ roomId: i.roomId, productId: largest(i.kind).id })),
      ...base.plan.rooms.map((r) => ({ roomId: r.id, productId: largest('sofa_3seat').id })),
    ];
    const scene = generateScene({ plan, styleId: 'modern', budgetGel: null, catalog, proposal: null, finishes: [], electrical: [], calculatorPicks: { furniture, productIds: [] }, seed: runSeed('sample', 1), at: '2026-11-24T00:00:00.000Z', aiCount: 0 });
    const outcomes = scene.picks ?? [];
    expect(outcomes).toHaveLength(furniture.length);
    const inner = (i: PlacedItem) => footprintQuad({ ...i, size: { ...i.size, width: i.size.width - 0.06, depth: i.size.depth - 0.06 } });
    for (const outcome of outcomes.filter((o) => o.itemId)) {
      const item = scene.items.find((i) => i.id === outcome.itemId)!;
      const where = scene.plan.rooms.find((r) => r.id === item.roomId)!;
      expect(footprintInRoom(box(item), where.polygon)).toBe(true);
      // A rug lies under the pieces; what hangs is not on the floor.
      if (LIES_FLAT.has(item.slot) || item.elevationM >= 0.05 || getArchetype(item.kind)?.ghost) continue;
      const others = scene.items.filter((o) => o.id !== item.id && o.roomId === item.roomId && o.elevationM < 0.05 && !LIES_FLAT.has(o.slot) && !getArchetype(o.kind)?.ghost && !tucksUnder(item, o));
      expect(others.filter((o) => quadsOverlap(inner(o), inner(item))).map((o) => `${item.kind} × ${o.kind}`)).toEqual([]);
    }
    expect(scene.generation.unplacedPicks ?? []).toEqual(outcomes.filter((o) => o.step === 'unplaced').map((o) => ({ roomId: o.roomId, productId: o.productId })));
    expect(outcomes.some((o) => o.step === 'unplaced')).toBe(true);
  });
});
