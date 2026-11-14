import { describe, expect, it } from 'vitest';
import { fitKitchenCorners, kitchenLeg, kitchenLegLength, kitchenLegOf, kitchenLegsOf, radiatorObstacles, runFromCorner, runIntoCorner, withoutOrphanLegs } from '@/lib/design/kitchenCorner';
import { isCustomKitchenItem, measureKitchenItem } from '@/lib/design/kitchen';
import { settleFitted } from '@/lib/design/fitted';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { Opening, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

/**
 * A corner (L-shaped) kitchen (`lib/design/kitchenCorner`, the owner's notes of 13 Nov 2026): a
 * made-to-measure run turns the corner at one of its ends — a leg along the next wall and wall
 * cabinets over it, each kitchen furniture copied from the run's own piece.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
function kitchen(openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id: 'k', type: 'kitchen', name: 'k', polygon: [P(0, 0), P(3.6, 0), P(3.6, 3), P(0, 3)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `o${i}`, roomId: 'k' })) });
}
const material = { productId: 20, nameKa: 'MDF', nameEn: 'MDF', slug: 'kitchen-material-mdf', brand: null, pricePerUnit: 600, unit: 'm2', qty: 2.16, totalPrice: 1296, imageUrl: null, colorHex: '#DCD5C8', textureUrl: null, model3dUrl: '/models/kitchen/mdf.glb', categorySlug: 'kitchen-custom', store: null };
/** A made-to-measure run on the south wall (index 0), `width` long, its middle at `x`. */
function run(x: number, width: number): PlacedItem {
  return { id: 'run', roomId: 'k', slot: 'kitchen_run', kind: 'kitchen_run', position: P(x, 0.3), rotation: 0, elevationM: 0, size: { width, depth: 0.6, height: 0.9 }, product: { ...material, qty: 1 }, custom: true, kitchenMaterial: material };
}
const fridge = (z: number): PlacedItem => ({ id: 'f', roomId: 'k', slot: 'fridge', kind: 'fridge', position: P(3.3, z), rotation: -Math.PI / 2, elevationM: 0, size: { width: 0.6, depth: 0.6, height: 1.8 }, product: { ...material, productId: 30 } });
const window = (wallIndex: number, t: number, sillM: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM: 1.2, heightM: 1.3, sillM, exterior: true });
const door = (wallIndex: number, t: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false });

describe('a kitchen’s corner leg', () => {
  const room = kitchen();
  // 2.4 m of run ending in the east corner.
  const inCorner = run(2.4, 2.4);
  const along = (item: PlacedItem) => [Math.round((item.position.z - item.size.width / 2) * 1000) / 1000, Math.round((item.position.z + item.size.width / 2) * 1000) / 1000];

  it('is kitchen furniture like the run: its product, material and model, from the run’s front along the next wall, 1.8 m', () => {
    const [leg, ...rest] = kitchenLeg(inCorner, room, 'right', [inCorner], []);
    expect(rest).toEqual([]);
    expect(leg).toMatchObject({ id: 'run-leg', slot: 'kitchen_run', legOf: 'run', legCorner: 'right', roomId: 'k', custom: true });
    expect(leg.product).toEqual(inCorner.product);
    expect(leg.size).toEqual({ width: 1.8, depth: 0.6, height: 0.9 });
    // Against the east wall, facing the room, 0.6–2.4 m from the corner.
    expect(leg.position).toEqual(P(3.3, 1.5));
    expect(Math.sin(leg.rotation)).toBeCloseTo(-1, 6);
    expect(along(leg)).toEqual([0.6, 2.4]);
    // Bought like the run: by its own façade, at the material's price.
    expect(isCustomKitchenItem(leg)).toBe(true);
    expect(leg.kitchenMaterial?.qty).toBeCloseTo(1.8 * 0.9, 2);
    expect(measureKitchenItem(leg).totalGel).toBeCloseTo(1.8 * 0.9 * 600, 2);
    expect(kitchenLegOf('run', [inCorner, leg])).toBe(leg);
  });

  it('needs the run in its corner: a run short of it is stretched to it first', () => {
    expect(kitchenLeg(inCorner, room, 'left', [inCorner], [])).toEqual([]);
    const stretched = runIntoCorner(inCorner, room, 'left', [inCorner])!;
    expect(stretched.size.width).toBe(3.6);
    expect(stretched.position.x).toBe(1.8);
    const [leg] = kitchenLeg(stretched, room, 'left', [stretched], []);
    expect(leg.position).toEqual(P(0.3, 1.5));
    expect(Math.sin(leg.rotation)).toBeCloseTo(1, 6);
    // Not where a fridge stands in the way of the run.
    const blocked: PlacedItem = { ...fridge(0), position: P(0.5, 0.3), rotation: 0 };
    expect(runIntoCorner(inCorner, room, 'left', [inCorner, blocked])).toBeNull();
  });

  it('runs under a window at the worktop or over it, never across a door or a low window, and stops at furniture', () => {
    expect(kitchenLegLength(kitchenLeg(inCorner, kitchen([window(1, 0.5, 0.95)]), 'right', [inCorner], [])[0])).toBe(1.8);
    // A sill at the worktop's own height is how kitchens are built.
    expect(kitchenLegLength(kitchenLeg(inCorner, kitchen([window(1, 0.5, 0.9)]), 'right', [inCorner], [])[0])).toBe(1.8);
    expect(kitchenLeg(inCorner, kitchen([window(1, 0.5, 0.5)]), 'right', [inCorner], [])).toEqual([]);
    expect(kitchenLeg(inCorner, kitchen([door(1, 0.25)]), 'right', [inCorner], [])).toEqual([]);
    expect(along(kitchenLeg(inCorner, room, 'right', [inCorner, fridge(1.5)], [])[0])).toEqual([0.6, 1.2]);
    // A corner that is an open side of a studio is no corner.
    expect(kitchenLeg(inCorner, { ...room, open: [1] }, 'right', [inCorner], [])).toEqual([]);
  });

  it('is built again at another length without its old self in the way', () => {
    const [leg] = kitchenLeg(inCorner, room, 'right', [inCorner], []);
    expect(along(kitchenLeg(inCorner, room, 'right', [inCorner, leg], [], 1.2)[0])).toEqual([0.6, 1.8]);
    expect(along(kitchenLeg(inCorner, room, 'right', [inCorner, leg], [], 9)[0])).toEqual([0.6, 3]);
  });

  it('is furniture that stays where it is put, and goes only with a run that is deleted or became a shop’s unit', () => {
    const [leg] = kitchenLeg(inCorner, room, 'right', [inCorner], []);
    const items = [inCorner, leg];
    expect(withoutOrphanLegs(items)).toBe(items);
    expect(withoutOrphanLegs([run(1.6, 2.4), leg])).toHaveLength(2);
    expect(withoutOrphanLegs([leg])).toEqual([]);
    expect(withoutOrphanLegs([{ ...inCorner, custom: false }, leg])).toHaveLength(1);
    expect(settleFitted([], [leg], [room]).items).toEqual([]);
  });

  it('lets the run grow and shrink from its corner', () => {
    const shorter = runFromCorner(inCorner, room, 'right', 1.8, [inCorner])!;
    expect(shorter.size.width).toBe(1.8);
    expect(shorter.position.x).toBeCloseTo(2.7, 3);
    expect(kitchenLeg(shorter, room, 'right', [shorter], [])).toHaveLength(1);
  });
});

describe('a corner’s wall cabinets', () => {
  const room = kitchen([window(1, 0.75, 0.9)]);
  const inCorner = run(2.4, 2.4);
  const hung: PlacedItem = { ...inCorner, id: 'up', slot: 'kitchen_wall', kind: 'kitchen_wall', position: P(2.4, 0.175), elevationM: 1.45, size: { width: 2.4, depth: 0.35, height: 0.7 } };

  it('turn the corner with the run’s, from the corner to the window, as wall-cabinet furniture', () => {
    const legs = kitchenLeg(inCorner, room, 'right', [inCorner, hung], []);
    expect(legs.map((l) => l.slot)).toEqual(['kitchen_run', 'kitchen_wall']);
    const upper = legs[1];
    expect(upper).toMatchObject({ id: 'run-leg-wall', legOf: 'run', elevationM: 1.45 });
    // The window is 1.65–2.85 m along that wall: flush from the run's own cabinets (35 cm) to 5 cm short of it.
    expect(upper.size).toEqual({ width: 1.25, depth: 0.35, height: 0.7 });
    expect(upper.position.x).toBeCloseTo(3.6 - 0.175, 3);
    expect(upper.position.z).toBeCloseTo(0.975, 3);
    expect(kitchenLegsOf('run', [inCorner, hung, ...legs])).toHaveLength(2);
    // A run with no wall cabinets has none on its leg.
    expect(kitchenLeg(inCorner, room, 'right', [inCorner], [])).toHaveLength(1);
  });
});

describe('the generation’s corner kitchens', () => {
  const room = kitchen();

  it('turns the corner for a run short of a kitchen, where the next wall and the floor before it are free', () => {
    const short = run(2.6, 2);
    const items = fitKitchenCorners([room], [short], []);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(short);
    expect(items[1]).toMatchObject({ legOf: 'run', legCorner: 'right', size: { width: 1.8 }, pinned: false });
    // A table standing 90 cm in front of that wall is in the leg's working floor.
    const table: PlacedItem = { id: 't', roomId: 'k', slot: 'dining_table', kind: 'dining_table', position: P(2.4, 1.5), rotation: 0, elevationM: 0, size: { width: 1.2, depth: 0.8, height: 0.75 }, product: { ...material, productId: 31 } };
    expect(fitKitchenCorners([room], [short, table], [])).toHaveLength(2);
  });

  it('builds no leg over a radiator', () => {
    const short = run(2.6, 2);
    // A radiator on the next wall, 1.65 m from the corner: 60 cm of leg is all that is left before it.
    const radiator = { id: 'rad', kind: 'radiator' as const, roomId: 'k', position: P(3.52, 1.65), elevationM: 0.12, origin: 'user' as const };
    expect(fitKitchenCorners([room], [short], [], [radiator])).toHaveLength(1);
    expect(kitchenLegLength(kitchenLeg(short, room, 'right', [short, ...radiatorObstacles([radiator])], [])[0])).toBe(0.6);
  });

  it('leaves a kitchen long enough on one wall, a shop’s unit and a run in the middle of its wall alone', () => {
    expect(fitKitchenCorners([room], [run(2.1, 3)], [])).toHaveLength(1);
    expect(fitKitchenCorners([room], [{ ...run(2.6, 2), custom: false, kitchenMaterial: undefined }], [])).toHaveLength(1);
    expect(fitKitchenCorners([room], [run(1.8, 2)], [])).toHaveLength(1);
  });
});
