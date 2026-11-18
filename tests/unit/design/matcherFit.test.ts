import { describe, expect, it } from 'vitest';
import { matchProducts, type CatalogProduct, type MatchOptions } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { Opening, PlacedItem, PlanRoom } from '@/lib/design/types';

/**
 * What a product has to clear to take its slot (docs/design-studio/generation-audit.md: RB6, O1,
 * O6, M8): the room, the windows and the pieces that stand — not a slot that got no product — and,
 * where any product can, a door's way, the floor the layout was told to keep clear and the working
 * floor in front of a kitchen run.
 */

function product(id: number, kind: string, widthCm: number, depthCm: number, heightCm: number, patch: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    nameKa: `p${id}`,
    slug: `p${id}`,
    brand: null,
    categorySlug: kind,
    pricePerUnit: 1000 + id,
    unit: 'piece',
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dKind: kind,
    model3dUrl: `/models/p${id}.glb`,
    widthCm,
    depthCm,
    heightCm,
    styleTags: ['modern'],
    tags: [],
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...patch,
  };
}

/** A room `w` × `d` with its corner at the origin: wall 0 runs along z = 0 and faces +z. */
const rect = (id: string, type: PlanRoom['type'], w: number, d: number, openings: Opening[] = []): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings });

/** A slot `w` × `d` × `h` with its back on wall 0, its middle `x` along it. */
const slot = (id: string, roomId: string, kind: string, slotName: PlacedItem['slot'], x: number, size: [number, number, number], patch: Partial<PlacedItem> = {}): PlacedItem => ({
  id,
  roomId,
  slot: slotName,
  kind,
  position: { x, z: size[1] / 2 },
  rotation: 0,
  elevationM: 0,
  size: { width: size[0], depth: size[1], height: size[2] },
  product: null,
  ...patch,
});

const match = (items: PlacedItem[], catalog: CatalogProduct[], rooms: PlanRoom[], options: Partial<MatchOptions> = {}) => matchProducts(items, catalog, { styleId: 'modern', rooms, ...options });

describe('a slot that got no product', () => {
  it('is in no later piece\'s way', () => {
    const room = rect('r', 'bedroom', 5, 4);
    // The catalogue has no shoe cabinet: its slot is dropped. The chest's slot is 5 cm beside it,
    // and the one chest there is, wider than its slot, reaches over where the shoe cabinet was laid.
    const shoes = slot('shoes', 'r', 'shoe_cabinet', 'shoe_cabinet', 1, [0.9, 0.36, 0.62]);
    const chest = slot('chest', 'r', 'dresser', 'dresser', 2.05, [1.1, 0.45, 0.82]);
    const wide = product(1, 'dresser', 150, 45, 82);
    const [gone, placed] = match([shoes, chest], [wide], [room]);
    expect(gone.product).toBeNull();
    expect(placed.product?.productId).toBe(1);
    // …while a piece that stands there is: with a shoe cabinet in the catalogue the wide chest does not fit.
    const [stands, refused] = match([shoes, chest], [wide, product(2, 'shoe_cabinet', 90, 36, 62)], [room]);
    expect(stands.product?.productId).toBe(2);
    expect(refused.product).toBeNull();
  });

  it('is nothing to hang clear of', () => {
    const room = rect('r', 'bedroom', 5, 4);
    // A print laid over the bed; no bed in the catalogue. It hangs at a print's own height (its
    // middle at 1.5 m), not 25 cm over the headboard of a bed that is not there.
    const bed = slot('bed', 'r', 'bed_double', 'bed', 2.5, [1.6, 2.05, 1.05]);
    const print = slot('print', 'r', 'artwork', 'artwork', 2.5, [0.95, 0.05, 0.7], { elevationM: 1.3 });
    const [, hung] = match([bed, print], [product(3, 'artwork', 90, 4, 60)], [room]);
    expect(hung.elevationM).toBeCloseTo(1.2);
    const [, over] = match([bed, print], [product(3, 'artwork', 90, 4, 60), product(4, 'bed_double', 160, 205, 105)], [room]);
    expect(over.elevationM).toBeCloseTo(1.3);
  });
});

describe('a basin lifted for its vanity', () => {
  it('still takes its floor: a piece matched after it does not stand under it', () => {
    const room = rect('b', 'bathroom', 3, 2.4);
    // A countertop basin's slot at the wall, and a shower's beside it: the cabin picked for it is
    // wider than the shower's slot and reaches under the basin, lifted to washing height.
    const sink = slot('sink', 'b', 'sink', 'sink', 0.6, [0.62, 0.48, 0.88]);
    const shower = slot('shower', 'b', 'shower', 'shower', 1.35, [0.8, 0.8, 2.05]);
    const catalog = [product(1, 'sink', 64, 37, 10), product(2, 'shower', 126, 97, 219), product(3, 'shower', 25, 15, 210)];
    const [basin, placed] = match([sink, shower], catalog, [room], { picks: { 'shower|b': 2 } });
    expect(basin.product?.productId).toBe(1);
    expect(basin.elevationM).toBeGreaterThan(0.5);
    expect(placed.product?.productId).toBe(3);
  });
});

describe('a piece hung over another', () => {
  it('hangs clear of what hangs or stands on the furniture under it, not only of the furniture', () => {
    const room = rect('l', 'living_room', 5, 4);
    // A TV unit, the TV slot over it and a print laid over the TV, as the layout lays a TV wall.
    const unit = slot('unit', 'l', 'tv_unit', 'tv_unit', 2.5, [1.8, 0.42, 0.5]);
    const tv = slot('tv', 'l', 'tv', 'tv', 2.5, [1.45, 0.08, 0.82], { elevationM: 0.65, position: { x: 2.5, z: 0.04 } });
    const print = slot('print', 'l', 'artwork', 'artwork', 2.4, [0.95, 0.05, 0.7], { elevationM: 1.15, position: { x: 2.4, z: 0.025 } });
    // The TV the catalogue has stands on its own feet, on the unit's top, up to 1.4 m.
    const [, onUnit, hung] = match([unit, tv, print], [product(1, 'tv_unit', 160, 40, 50), product(2, 'tv', 145, 26, 90), product(3, 'artwork', 14, 16, 20)], [room]);
    expect(onUnit.elevationM).toBeCloseTo(0.5);
    expect(hung.elevationM).toBeGreaterThanOrEqual(onUnit.elevationM + onUnit.size.height);
    expect(hung.elevationM + hung.size.height).toBeLessThanOrEqual(room.heightM);
  });
});

describe('what the layout kept clear', () => {
  // A door in the west wall by the north-west corner: its way is the floor 90 cm into the room
  // (x 0–0.9), as wide as the door (z 0.15–1.05).
  const door: Opening = { id: 'door', kind: 'door', wallIndex: 3, t: 0.85, widthM: 0.9, heightM: 2.1, sillM: 0, roomId: 'r', exterior: false };
  const room = rect('r', 'bedroom', 5, 4, [door]);
  const plain = rect('r', 'bedroom', 5, 4);
  // A chest's slot on the north wall, 5 cm clear of the door's way (x 0.95–2.05).
  const chest = () => slot('chest', 'r', 'dresser', 'dresser', 1.5, [1.1, 0.45, 0.82]);
  // The one the draw prefers is 13 cm wider than its slot — 6.5 cm into the door's way; the other keeps out.
  const wider = product(1, 'dresser', 123, 45, 82, { isFeatured: true });
  const narrower = product(2, 'dresser', 100, 45, 82);

  it('a door\'s way: the product that keeps out of it takes the slot', () => {
    expect(match([chest()], [wider, narrower], [plain])[0].product?.productId).toBe(1);
    expect(match([chest()], [wider, narrower], [room])[0].product?.productId).toBe(2);
  });

  it('the floor the layout was told to keep clear: a radiator\'s strip, a column, a partition\'s floor', () => {
    const strip = { minX: 0, maxX: 0.92, minZ: 0, maxZ: 0.6 };
    expect(match([chest()], [wider, narrower], [plain], { keepClear: { r: [strip] } })[0].product?.productId).toBe(2);
    // Another room's is not this room's.
    expect(match([chest()], [wider, narrower], [plain], { keepClear: { other: [strip] } })[0].product?.productId).toBe(1);
  });

  it('never costs the room a piece: with no product that keeps clear, the one it would have had', () => {
    const [placed] = match([chest()], [wider], [room], { keepClear: { r: [{ minX: 0, maxX: 0.92, minZ: 0, maxZ: 0.6 }] } });
    expect(placed.product?.productId).toBe(1);
  });

  it('goes through the style\'s ways out before it gives a door\'s way up', () => {
    // The style's own bed reaches into the door's way; another style's keeps out of it.
    const bed = slot('bed', 'r', 'bed_double', 'bed', 2, [1.6, 2.05, 1.05]);
    const own = product(5, 'bed_double', 230, 205, 105);
    const other = product(6, 'bed_double', 160, 205, 105, { styleTags: ['vintage'] });
    expect(match([bed], [own, other], [plain])[0].product?.productId).toBe(5);
    expect(match([bed], [own, other], [room])[0].product?.productId).toBe(6);
    expect(match([bed], [own], [room])[0].product?.productId).toBe(5);
  });

  it('holds the designer\'s pick to the same: it gives way to a product that keeps clear, and takes the slot only when none does', () => {
    const strip = { minX: 0, maxX: 0.92, minZ: 0, maxZ: 0.6 };
    // Where nothing is in its way the pick is the room's, whatever the draw would have been.
    expect(match([chest()], [narrower, wider], [plain], { picks: { 'dresser|r': 1 } })[0].product?.productId).toBe(1);
    // The wider chest the designer chose fits the room only by standing 6.5 cm into the door's way,
    // or on the floor before a radiator: the chest that keeps them clear takes the slot.
    expect(match([chest()], [narrower, wider], [room], { picks: { 'dresser|r': 1 } })[0].product?.productId).toBe(2);
    expect(match([chest()], [narrower, wider], [plain], { picks: { 'dresser|r': 1 }, keepClear: { r: [strip] } })[0].product?.productId).toBe(2);
    // With no product that keeps them clear, the pick stands where it fits.
    expect(match([chest()], [wider], [room], { picks: { 'dresser|r': 1 }, keepClear: { r: [strip] } })[0].product?.productId).toBe(1);
    // A pick that does not fit the room at all is not placed: the matcher's own takes the slot.
    const huge = product(3, 'dresser', 560, 45, 82);
    expect(match([chest()], [wider, narrower, huge], [room], { picks: { 'dresser|r': 3 } })[0].product?.productId).toBe(2);
  });

  it('does not turn the door mat down for lying in the door\'s way: the layout laid it there', () => {
    const mat = slot('mat', 'r', 'door_mat', 'door_mat', 0.45, [0.8, 0.5, 0.015], { position: { x: 0.45, z: 0.6 }, rotation: Math.PI / 2 });
    const [placed] = match([mat], [product(7, 'door_mat', 80, 50, 2)], [room]);
    expect(placed.product?.productId).toBe(7);
    expect(placed.position).toEqual({ x: 0.45, z: 0.6 });
  });
});

describe('a door mat and a hanging lamp', () => {
  // A hall 1.2 m wide, the front door in the middle of its west wall; the mat's slot just inside it.
  const front: Opening = { id: 'front', kind: 'door', wallIndex: 3, t: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0, roomId: 'h', exterior: true };
  const hall = rect('h', 'hallway', 1.2, 4, [front]);
  const mat = () => slot('mat', 'h', 'door_mat', 'door_mat', 0, [0.8, 0.5, 0.015], { position: { x: 0.28, z: 2 }, rotation: Math.PI / 2 });
  // As the catalogue has them: five of six door mats are filed 2.03 × 1.27 m.
  const huge = product(20, 'door_mat', 203, 127, 2, { isFeatured: true });
  const proper = product(21, 'door_mat', 75, 45, 2);

  it('a mat lies inside its room: the next one that does takes the slot, its edge by the door', () => {
    const [placed] = match([mat()], [huge, proper], [hall], { picks: { 'door_mat|h': 20 } });
    expect(placed.product?.productId).toBe(21);
    expect(placed.position.x - placed.size.depth / 2).toBeCloseTo(0.03);
    expect(placed.position.z).toBeCloseTo(2);
  });

  it('a lamp hangs within its room: the next one that does takes the slot, where it was hung', () => {
    const bedroom = rect('b', 'bedroom', 3, 3);
    const pendant = slot('lamp', 'b', 'pendant', 'pendant', 1.5, [0.52, 0.52, 0.55], { position: { x: 1.5, z: 1.5 }, elevationM: 2.25 });
    // A cluster of lamps filed 3.16 × 3.96 m, in a room 3 m across.
    const cluster = product(22, 'pendant', 316, 396, 38, { isFeatured: true });
    const lamp = product(23, 'pendant', 40, 40, 40);
    const [placed] = match([pendant], [cluster, lamp], [bedroom], { picks: { 'pendant|b': 22 } });
    expect(placed.product?.productId).toBe(23);
    expect(placed.position).toEqual({ x: 1.5, z: 1.5 });
    // In a room it hangs within, the cluster is the lamp drawn.
    const loft = rect('b', 'bedroom', 6, 6);
    expect(match([{ ...pendant, position: { x: 3, z: 3 } }], [cluster, lamp], [loft], { picks: { 'pendant|b': 22 } })[0].product?.productId).toBe(22);
  });

  it('with none that does, the one the room would have had', () => {
    const [placed] = match([mat()], [huge], [hall]);
    expect(placed.product?.productId).toBe(20);
    expect(placed.position).toEqual({ x: 0.28, z: 2 });
    const bedroom = rect('b', 'bedroom', 3, 3);
    const pendant = slot('lamp', 'b', 'pendant', 'pendant', 1.5, [0.52, 0.52, 0.55], { position: { x: 1.5, z: 1.5 }, elevationM: 2.25 });
    expect(match([pendant], [product(22, 'pendant', 316, 396, 38)], [bedroom])[0].product?.productId).toBe(22);
  });
});

describe('the working floor in front of a kitchen run', () => {
  const kitchen = rect('k', 'kitchen', 4, 4);
  // The run on the north wall, x 0–3: its working floor is z 0.62–1.82 before it.
  const run = () => slot('run', 'k', 'kitchen_run', 'kitchen_run', 1.5, [3, 0.62, 0.92]);
  const runProduct = product(10, 'kitchen_run', 300, 62, 92);

  it('is kept by the table: one that stands beyond it takes the slot', () => {
    const table = slot('table', 'k', 'dining_table', 'dining_table', 2, [1.2, 0.82, 0.75], { position: { x: 2, z: 2.4 } });
    // 1.3 m deep where the slot was 0.82: 7 cm into the working floor.
    const deep = product(11, 'dining_table', 120, 130, 75, { isFeatured: true });
    const shallow = product(12, 'dining_table', 120, 80, 75);
    expect(match([table], [deep, shallow], [kitchen])[0].product?.productId).toBe(11);
    const [, placed] = match([run(), table], [runProduct, deep, shallow], [kitchen]);
    expect(placed.product?.productId).toBe(12);
    expect(match([run(), table], [runProduct, deep], [kitchen])[1].product?.productId).toBe(11);
  });

  it('is the kitchen furniture\'s own: a fridge is not turned down for standing on it', () => {
    // A fridge on the east wall beside the run's end; the deep one reaches 5 cm over the working floor.
    const at = { position: { x: 4 - 0.36, z: 1.2 }, rotation: -Math.PI / 2 };
    const fridge = slot('fridge', 'k', 'fridge', 'fridge', 0, [0.72, 0.72, 1.92], at);
    const deep = product(13, 'fridge', 60, 105, 190, { isFeatured: true });
    const shallow = product(14, 'fridge', 60, 65, 190);
    expect(match([run(), fridge], [runProduct, deep, shallow], [kitchen])[1].product?.productId).toBe(13);
    // A bookcase in the same place is.
    const shelf = slot('shelf', 'k', 'bookshelf', 'bookshelf', 0, [0.72, 0.72, 1.92], at);
    const deepShelf = product(15, 'bookshelf', 60, 105, 190, { isFeatured: true });
    const shallowShelf = product(16, 'bookshelf', 60, 65, 190);
    expect(match([run(), shelf], [runProduct, deepShelf, shallowShelf], [kitchen])[1].product?.productId).toBe(16);
  });
});

describe('the chairs of a table against a wall', () => {
  const kitchen = rect('k', 'kitchen', 4, 4);
  // As the engine lays a table with no room to stand free: 1.2 × 0.82 m, its back on the north
  // wall, a chair at each of the two seats before it and one at each end — none behind it, where
  // the wall is (`seatSlots`: 13 cm clear of the edge, chairs 50 cm deep).
  const table = () => slot('table', 'k', 'dining_table', 'dining_table', 2, [1.2, 0.82, 0.75]);
  const chair = (id: string, x: number, z: number, rotation: number): PlacedItem => slot(id, 'k', 'dining_chair', 'dining_chair', 0, [0.46, 0.5, 0.92], { position: { x, z }, rotation });
  const chairs = () => [chair('front-left', 1.7, 0.95, Math.PI), chair('front-right', 2.3, 0.95, Math.PI), chair('end-right', 2.73, 0.41, -Math.PI / 2), chair('end-left', 1.27, 0.41, Math.PI / 2)];
  const chairProduct = product(31, 'dining_chair', 46, 50, 92);
  const seated = (tableProduct: CatalogProduct) => {
    const [top, ...round] = match([table(), ...chairs()], [tableProduct, chairProduct], [kitchen]);
    return { top, round: round.filter((c) => c.product) };
  };

  it('sit at the seats the engine gave them round the real table: before it and at its ends', () => {
    // A table 8 cm deeper than its slot: the same seats, each a little further out.
    const { top, round } = seated(product(30, 'dining_table', 120, 90, 75));
    expect(top.position.z - top.size.depth / 2).toBeCloseTo(0);
    expect(round.map((c) => c.id)).toEqual(['front-left', 'front-right', 'end-right', 'end-left']);
    const [left, right, endRight, endLeft] = round;
    // Before the table, facing it, on the room's side; at its ends, facing it — nobody at the wall.
    for (const c of [left, right]) {
      expect(c.position.z).toBeCloseTo(0.9 + 0.13);
      expect(c.rotation).toBeCloseTo(Math.PI);
    }
    expect([left.position.x, right.position.x]).toEqual([expect.closeTo(1.7), expect.closeTo(2.3)]);
    expect(endRight.position).toEqual({ x: expect.closeTo(2.73), z: expect.closeTo(0.45) });
    expect(endLeft.position).toEqual({ x: expect.closeTo(1.27), z: expect.closeTo(0.45) });
    for (const c of round) expect(c.position.z).toBeGreaterThan(top.position.z - 1e-9);
  });

  it('a smaller table keeps the chairs it has seats for on those sides, and a chair with no seat there goes', () => {
    // 0.9 × 0.9 m: one seat before it, one at each end (and one behind it, at the wall, for nobody).
    const { round } = seated(product(32, 'dining_table', 90, 90, 75));
    expect(round.map((c) => c.id)).toEqual(['front-left', 'end-right', 'end-left']);
    expect(round[0].position.x).toBeCloseTo(2);
  });

  it('a longer table seats them at the seats nearest the ones they had, the same either end', () => {
    // 2.4 m: four seats before it. The two chairs take the middle two.
    const wide = rect('k', 'kitchen', 6, 4);
    const [top, ...round] = match([{ ...table(), position: { x: 3, z: 0.41 } }, ...chairs().map((c) => ({ ...c, position: { x: c.position.x + 1, z: c.position.z } }))], [product(33, 'dining_table', 240, 82, 75), chairProduct], [wide]);
    const front = round.filter((c) => c.product && Math.abs(c.rotation - Math.PI) < 0.01).map((c) => c.position.x - top.position.x);
    expect(front).toEqual([expect.closeTo(-0.3), expect.closeTo(0.3)]);
  });

  it('a chair that does not fit at its own seat sits at one that is free, never at the wall', () => {
    // The same 2.4 m table in a room 2.8 m wide: no room for a chair at either end. The two end
    // chairs take the seats before the table that are no chair's — the outer two.
    const narrow = rect('k', 'kitchen', 2.8, 4);
    const [top, ...round] = match([{ ...table(), position: { x: 1.4, z: 0.41 } }, ...chairs().map((c) => ({ ...c, position: { x: c.position.x - 0.6, z: c.position.z } }))], [product(33, 'dining_table', 240, 82, 75), chairProduct], [narrow]);
    const sat = round.filter((c) => c.product);
    expect(sat.map((c) => c.id)).toEqual(['front-left', 'front-right', 'end-right', 'end-left']);
    for (const c of sat) {
      expect(c.rotation).toBeCloseTo(Math.PI);
      expect(c.position.z).toBeCloseTo(0.82 + 0.13);
    }
    expect(sat.map((c) => c.position.x - top.position.x)).toEqual([expect.closeTo(-0.3), expect.closeTo(0.3), expect.closeTo(-0.9), expect.closeTo(0.9)]);
  });

  it('chairs the real table has no seats for where they were laid sit where it has', () => {
    // A table standing free with a chair at each end only; the real one, 70 × 70 cm, has a seat
    // before it and one behind it and none at its ends.
    const free = { ...table(), position: { x: 2, z: 2 } };
    const ends = [chair('end-right', 2.73, 2, -Math.PI / 2), chair('end-left', 1.27, 2, Math.PI / 2)];
    const [top, ...round] = match([free, ...ends], [product(34, 'dining_table', 70, 70, 75), chairProduct], [kitchen]);
    expect(round.every((c) => c.product)).toBe(true);
    expect(round.map((c) => c.position.x)).toEqual([expect.closeTo(2), expect.closeTo(2)]);
    expect(round.map((c) => c.position.z - top.position.z).sort()).toEqual([expect.closeTo(-0.48), expect.closeTo(0.48)]);
  });
});
