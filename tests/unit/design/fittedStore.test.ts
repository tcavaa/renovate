import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { houseItem, joineryObstacles, withJoinery } from '@/lib/design/decor/housing';
import { isPlacementValid } from '@/lib/design/manipulate';
import { kitchenLegOf } from '@/lib/design/kitchenCorner';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { DesignStoreHook } from '@/store/designStore';
import type { FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

/**
 * The store keeps what is fitted to the furniture with it (`lib/design/fitted`): a drag of the
 * machine takes its column, a drag of the column takes the machine, deleting the machine deletes
 * the column, and the card's button builds it again — each one step of history.
 */

let useDesignStore: DesignStoreHook;

beforeAll(async () => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  });
  ({ useDesignStore } = await import('@/store/designStore'));
});

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom => refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
const plan = (room: PlanRoom): FloorPlan => ({ rooms: [room], metresPerPixel: null, bounds: { width: 4, depth: 3 }, source: 'manual', wallThicknessM: 0.12 });
const product = { productId: 1, nameKa: 'p', nameEn: 'p', slug: 'p', brand: null, pricePerUnit: 100, unit: 'piece', qty: 1, totalPrice: 100, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/m/1.glb', categorySlug: 'sanitary', store: null };
const washer: PlacedItem = { id: 'w', roomId: 'b', slot: 'washer', kind: 'washer', position: P(1, 0.295), rotation: 0, elevationM: 0, size: { width: 0.6, depth: 0.55, height: 0.85 }, product };
const material = { ...product, productId: 20, slug: 'kitchen-material-mdf', unit: 'm2', pricePerUnit: 600, categorySlug: 'kitchen-custom' };
const run: PlacedItem = { id: 'run', roomId: 'b', slot: 'kitchen_run', kind: 'kitchen_run', position: P(2.8, 0.3), rotation: 0, elevationM: 0, size: { width: 2.4, depth: 0.6, height: 0.9 }, product: material, custom: true, kitchenMaterial: material };

describe('the store keeps fitted pieces with their furniture', () => {
  const room = rect('b', 'bathroom', 4, 3);

  beforeEach(() => {
    useDesignStore.getState().reset();
    const built = houseItem(washer, [room], [washer], [])!;
    useDesignStore.setState({ plan: plan(room), styleId: 'modern', items: built.items, decor: built.decor });
  });

  it('moves the column with a dragged machine and back with one undo', () => {
    const store = useDesignStore.getState();
    store.placeItem('w', P(2.5, 0.295), 0);
    expect(useDesignStore.getState().decor[0].span).toEqual({ from: 2.172, to: 2.828 });
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().decor[0].span).toEqual({ from: 0.672, to: 1.328 });
    expect(useDesignStore.getState().items[0].position).toEqual(P(1, 0.295));
  });

  it('takes the dryer stacked on a dragged machine with it', () => {
    const dryer: PlacedItem = { ...washer, id: 'w-dryer', slot: 'dryer', kind: 'dryer', position: P(1, 0.33), elevationM: 0.88, size: { width: 0.6, depth: 0.62, height: 0.86 } };
    useDesignStore.setState({ items: [...useDesignStore.getState().items, dryer] });
    useDesignStore.getState().placeItem('w', P(2.5, 1.6), 0);
    const state = useDesignStore.getState();
    // Out in the room: its column is given up, the dryer still rides on it.
    expect(state.decor).toEqual([]);
    expect(state.items.find((i) => i.id === 'w-dryer')!.position).toEqual(P(2.5, 1.635));
    expect(state.items.find((i) => i.id === 'w-dryer')!.elevationM).toBe(0.88);
  });

  it('moves the machine with a dragged column, refuses a place with no room, and resizes it for real', () => {
    const id = useDesignStore.getState().decor[0].id;
    expect(useDesignStore.getState().moveDecor(id, { wallIndex: 0, span: { from: 3, to: 3.656 }, height: { from: 0, to: 0.88 } })).toBe(true);
    expect(useDesignStore.getState().items[0].position.x).toBeCloseTo(3.328, 3);
    // Onto the east wall: the machine turns to face the room.
    expect(useDesignStore.getState().moveDecor(id, { wallIndex: 1, span: { from: 1, to: 1.656 }, height: { from: 0, to: 0.88 } })).toBe(true);
    const moved = useDesignStore.getState();
    expect(moved.decor[0].wallIndex).toBe(1);
    expect(moved.items[0].position.x).toBeCloseTo(4 - 0.295, 3);
    expect(Math.sin(moved.items[0].rotation)).toBeCloseTo(-1, 5);
    // Taller: the section's own height changes (it used to keep its own whatever the arrow said).
    expect(useDesignStore.getState().setDecorExtent(id, { span: moved.decor[0].span, height: { from: 0, to: 2 } })).toBe(true);
    expect(useDesignStore.getState().decor[0].params.sections![0].heightMm).toBe(2000);
  });

  it('deletes the column with its machine, and the card builds it again', () => {
    useDesignStore.getState().removeItem('w');
    expect(useDesignStore.getState().decor).toEqual([]);
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().decor).toHaveLength(1);
    useDesignStore.getState().removeDecor(useDesignStore.getState().decor[0].id);
    expect(useDesignStore.getState().items).toHaveLength(1);
    expect(useDesignStore.getState().addFitted('w')).toBe(true);
    expect(useDesignStore.getState().decor[0].params.sections![0].itemId).toBe('w');
    expect(useDesignStore.getState().addFitted('w')).toBe(false);
  });

  it('turns a kitchen run round its corner with a leg that is furniture, grows it from that corner, and makes it straight again', () => {
    useDesignStore.setState({ items: [run], decor: [] });
    expect(useDesignStore.getState().setKitchenCorner('run', 'right')).toBe(true);
    const leg = kitchenLegOf('run', useDesignStore.getState().items)!;
    expect(leg).toMatchObject({ slot: 'kitchen_run', legCorner: 'right', size: { width: 1.8 } });
    expect(useDesignStore.getState().decor).toEqual([]);
    expect(useDesignStore.getState().setKitchenLegLength('run', 1.2)).toBe(true);
    expect(kitchenLegOf('run', useDesignStore.getState().items)!.size.width).toBe(1.2);
    // Shorter: still in its corner, the leg still there.
    expect(useDesignStore.getState().setKitchenLength('run', 1.8)).toBe(true);
    const shorter = useDesignStore.getState();
    expect(shorter.items.find((i) => i.id === 'run')!.position.x).toBeCloseTo(3.1, 3);
    expect(kitchenLegOf('run', shorter.items)).not.toBeNull();
    // The other corner: the run is stretched to it, the leg goes there.
    expect(useDesignStore.getState().setKitchenCorner('run', 'left')).toBe(true);
    expect(useDesignStore.getState().items.find((i) => i.id === 'run')!.size.width).toBe(4);
    expect(kitchenLegOf('run', useDesignStore.getState().items)!.legCorner).toBe('left');
    // The leg is furniture: dragged somewhere, it stays; deleting the run takes it along.
    useDesignStore.getState().placeItem('run-leg', P(2, 2.2), 0);
    expect(kitchenLegOf('run', useDesignStore.getState().items)!.position).toEqual(P(2, 2.2));
    expect(useDesignStore.getState().setKitchenCorner('run', null)).toBe(true);
    expect(useDesignStore.getState().items.map((i) => i.id)).toEqual(['run']);
  });
});

describe('furniture keeps out of joinery', () => {
  const room = rect('b', 'bathroom', 4, 3);
  const built = houseItem(washer, [room], [washer], [])!;
  const obstacles = joineryObstacles(built.decor, [room]);

  it('may not be dropped into a column, but the machine the column is built for stands in it', () => {
    const basket: PlacedItem = { ...washer, id: 'x', slot: 'nightstand', kind: 'nightstand', position: P(1, 0.3), size: { width: 0.4, depth: 0.4, height: 0.5 } };
    expect(isPlacementValid(room, basket, withJoinery([...built.items, basket], obstacles, 'x').filter((i) => i.id !== 'w'), [room])).toBe(false);
    expect(isPlacementValid(room, { ...basket, position: P(2.5, 0.3) }, withJoinery([...built.items, basket], obstacles, 'x'), [room])).toBe(true);
    expect(isPlacementValid(room, built.items[0], withJoinery(built.items, obstacles, 'w'), [room])).toBe(true);
    // Its dryer rides on it.
    expect(withJoinery(built.items, obstacles, 'w-dryer')).toHaveLength(built.items.length);
  });
});
