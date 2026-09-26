import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
import { priceScene } from '@/lib/design/pricing';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlacedItem, SlotKind } from '@/lib/design/types';
import type { DesignStoreHook } from '@/store/designStore';

/**
 * The store's own rules — the ones that are about *sequence* rather than geometry: what a
 * carry does to the history, what Escape puts back, what a whole-room pick paints over.
 * The geometry underneath has its own tests (`manipulate`, `paint`, `zones`).
 */

let useDesignStore: DesignStoreHook;

beforeAll(async () => {
  // `persist` wants a localStorage; node has none. One that remembers is enough.
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  });
  ({ useDesignStore } = await import('@/store/designStore'));
});

const plan = (): FloorPlan => ({
  rooms: [
    refreshRoom({
      id: 'r1',
      type: 'living_room',
      name: 'living',
      polygon: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 3 },
        { x: 0, z: 3 },
      ],
      heightM: 2.8,
      areaM2: 0,
      perimeterM: 0,
      openings: [],
    }),
  ],
  metresPerPixel: null,
  bounds: { width: 4, depth: 3 },
  source: 'manual',
  wallThicknessM: 0.2,
});

const sofa = (id: number, widthCm: number, depthCm: number): CatalogProduct =>
  ({ id, nameKa: `sofa ${id}`, slug: `sofa-${id}`, brand: null, categorySlug: 'sofas', pricePerUnit: 1000 + id, unit: 'piece', imageUrl: null, colorHex: '#888888', textureUrl: null, model3dKind: 'sofa_3seat', model3dUrl: `/models/sofa-${id}.glb`, widthCm, depthCm, heightCm: 80, styleTags: [], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as CatalogProduct;

const paint = (id: number): CatalogProduct =>
  ({ id, nameKa: `paint ${id}`, slug: `paint-${id}`, brand: null, categorySlug: 'paint', pricePerUnit: 12, unit: 'm2', imageUrl: null, colorHex: '#aabbcc', textureUrl: '/t.jpg', model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: [], tags: [], isFeatured: false, specs: { surfaces: ['floor', 'wall'] }, coveragePerUnit: null, store: null }) as CatalogProduct;

const placed = (id: string, x: number, z: number, width: number, depth: number, kind = 'sofa_3seat', slot: SlotKind = 'sofa'): PlacedItem => ({
  id,
  roomId: 'r1',
  slot,
  kind,
  position: { x, z },
  elevationM: 0,
  rotation: 0,
  size: { width, depth, height: 0.8 },
  product: null,
});

/** The one room of the store's plan, as the store holds it (its walls derived, its id kept). */
const room = () => useDesignStore.getState().plan!.rooms[0];
const item = (id: string) => useDesignStore.getState().items.find((i) => i.id === id);

beforeEach(() => {
  useDesignStore.getState().reset();
  useDesignStore.getState().setPlan(plan());
});

describe('swapping a product', () => {
  it('stands the new one where the old one stood when it fits there', () => {
    // A 2 m sofa with its back on the top wall; the television opposite it.
    useDesignStore.setState({ items: [placed('sofa', 2, 0.47, 2, 0.9), placed('tv', 2, 2.75, 1.6, 0.4, 'tv_unit')] });
    expect(useDesignStore.getState().swapProduct('sofa', sofa(1, 220, 90), { carry: true })).toBe('swapped');
    expect(item('sofa')?.product?.productId).toBe(1);
    expect(item('sofa')?.position.x).toBeCloseTo(2, 6);
    expect(item('sofa')?.position.z).toBeCloseTo(0.47, 6);
    expect(useDesignStore.getState().carryingItemId).toBeNull();
    expect(useDesignStore.getState().history.past).toHaveLength(1);
  });

  it('keeps the back of a deeper one on the wall instead of pushing it through', () => {
    useDesignStore.setState({ items: [placed('sofa', 2, 0.47, 2, 0.9)] });
    expect(useDesignStore.getState().swapProduct('sofa', sofa(2, 200, 130), { carry: true })).toBe('swapped');
    // Centre kept, the back would be 20 cm inside the wall; flush, it is a hair off it.
    const z = item('sofa')!.position.z;
    expect(z - 0.65).toBeGreaterThanOrEqual(room().polygon[0].z);
    expect(z - 0.65).toBeLessThan(0.05);
  });

  it('hands one that does not fit to the pointer, and Escape brings the old one back', () => {
    const old = placed('sofa', 2, 0.47, 2, 0.9);
    useDesignStore.setState({ items: [old, placed('table', 2, 1.45, 1.2, 0.8, 'coffee_table')] });
    // 1.6 m deep: flush against the wall it still lands on the table.
    expect(useDesignStore.getState().swapProduct('sofa', sofa(3, 320, 160), { carry: true })).toBe('carrying');
    const state = useDesignStore.getState();
    expect(state.carryingItemId).toBe('sofa');
    expect(item('sofa')?.product?.productId).toBe(3);
    // Nothing has been put anywhere yet: not a step of history, not in what is saved.
    expect(state.history.past).toHaveLength(0);
    expect(state.scene().items.find((i) => i.id === 'sofa')).toEqual(old);

    useDesignStore.getState().cancelCarry();
    expect(item('sofa')).toEqual(old);
    expect(useDesignStore.getState().carryingItemId).toBeNull();
    expect(useDesignStore.getState().selectedItemId).toBe('sofa');
    expect(useDesignStore.getState().history.past).toHaveLength(0);
  });

  it('makes one step of history of a carry, however often the piece was turned on the way', () => {
    const old = placed('sofa', 2, 0.47, 2, 0.9);
    useDesignStore.setState({ items: [old, placed('table', 2, 1.45, 1.2, 0.8, 'coffee_table')] });
    useDesignStore.getState().swapProduct('sofa', sofa(3, 320, 160), { carry: true });
    useDesignStore.getState().placeItem('sofa', { x: 2, z: 2 }, Math.PI / 2, 'r1');
    useDesignStore.getState().placeItem('sofa', { x: 1.7, z: 2.1 }, 0, 'r1');
    useDesignStore.getState().finishCarry();
    expect(useDesignStore.getState().history.past).toHaveLength(1);
    expect(item('sofa')?.position).toEqual({ x: 1.7, z: 2.1 });

    useDesignStore.getState().undo();
    expect(item('sofa')).toEqual(old);
    useDesignStore.getState().redo();
    expect(item('sofa')?.product?.productId).toBe(3);
  });

  it('puts it in as it is where nothing can carry it (the 2D board)', () => {
    useDesignStore.setState({ items: [placed('sofa', 2, 0.47, 2, 0.9), placed('table', 2, 1.45, 1.2, 0.8, 'coffee_table')] });
    expect(useDesignStore.getState().swapProduct('sofa', sofa(3, 320, 160))).toBe('swapped');
    expect(useDesignStore.getState().carryingItemId).toBeNull();
    expect(item('sofa')?.product?.productId).toBe(3);
  });

  it('gives a swap up for the old piece when another tile is picked off the shelf', () => {
    const old = placed('sofa', 2, 0.47, 2, 0.9);
    useDesignStore.setState({ items: [old, placed('table', 2, 1.45, 1.2, 0.8, 'coffee_table')] });
    useDesignStore.getState().swapProduct('sofa', sofa(3, 320, 160), { carry: true });
    const added = useDesignStore.getState().beginAdd(sofa(4, 90, 90), 'r1');
    expect(added).not.toBeNull();
    expect(item('sofa')).toEqual(old);
    expect(useDesignStore.getState().carryingItemId).toBe(added);
    // …and the one picked second goes when a third is: one piece rides on the pointer at a time.
    // (Ids carry the millisecond, so two made in one tick of a test can share one: count products.)
    useDesignStore.getState().beginAdd(sofa(5, 80, 80), 'r1');
    const products = useDesignStore.getState().items.map((i) => i.product?.productId ?? null);
    expect(products).not.toContain(4);
    expect(products.filter((id) => id === 5)).toHaveLength(1);
  });
});

describe('painting the whole room', () => {
  it('paints over a wall of its own, a strip and a square metre', () => {
    const store = useDesignStore.getState();
    store.setWallFinish('r1', 1, paint(1));
    store.paintSurface({ roomId: 'r1', surface: 'wall', wallIndex: 0, span: { from: 1, to: 2 } }, paint(2));
    store.paintSurface({ roomId: 'r1', surface: 'wall', wallIndex: 2, span: { from: 0, to: 1 }, patch: [0, 1] }, paint(3));
    const before = useDesignStore.getState().finishes.filter((f) => f.roomId === 'r1' && f.surface === 'wall');
    expect(before.length).toBeGreaterThanOrEqual(4);

    useDesignStore.getState().setFinish(['r1'], 'wall', paint(9));
    const walls = useDesignStore.getState().finishes.filter((f) => f.roomId === 'r1' && f.surface === 'wall');
    expect(walls).toHaveLength(1);
    expect(walls[0].product?.productId).toBe(9);
    expect(walls[0].wallIndex ?? null).toBeNull();
    // The floor was not asked about.
    expect(useDesignStore.getState().finishes.some((f) => f.roomId === 'r1' && f.surface === 'floor')).toBe(true);

    // One step back and the accents are there again.
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().finishes.filter((f) => f.roomId === 'r1' && f.surface === 'wall')).toHaveLength(before.length);
  });

  it('lays the new floor over painted tiles and drawn zones, and lets go of a selected zone', () => {
    const store = useDesignStore.getState();
    store.paintSurface({ roomId: 'r1', surface: 'floor', cell: [0, 0] }, paint(2));
    const zoneId = store.addFinishZone('r1', { id: 'z1', polygon: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 1, z: 2 }] }, paint(3));
    expect(useDesignStore.getState().selectedElement).toEqual({ kind: 'zone', id: zoneId, roomId: 'r1' });

    useDesignStore.getState().setFinish(['r1'], 'floor', paint(9));
    const floors = useDesignStore.getState().finishes.filter((f) => f.roomId === 'r1' && f.surface === 'floor');
    expect(floors).toHaveLength(1);
    expect(floors[0].product?.productId).toBe(9);
    expect(useDesignStore.getState().selectedElement).toBeNull();
  });
});

describe('the empty start', () => {
  it('opens the studio on the flat as drawn with nothing in it, and closes the steps before it', () => {
    useDesignStore.getState().setMode('full');
    useDesignStore.getState().chooseEmptyStart();
    let state = useDesignStore.getState();
    expect(state.emptyStart).toBe(true);
    expect(state.modeChosen).toBe(true);
    expect(state.mode).toBe('design_only');

    // Whatever an earlier layout left behind goes; the rooms stay as drawn.
    useDesignStore.setState({ items: [placed('sofa', 2, 0.47, 2, 0.9)] });
    useDesignStore.getState().saveVersion('01');
    expect(useDesignStore.getState().versions).toHaveLength(1);
    useDesignStore.getState().startEmpty();
    state = useDesignStore.getState();
    expect(state.items).toEqual([]);
    expect(state.electrical).toEqual([]);
    expect(state.finishes.every((f) => !f.product)).toBe(true);
    expect(state.plan?.rooms).toHaveLength(1);
    expect(state.generated).toBe(true);
    expect(state.step).toBe(5);
    expect(state.versions).toEqual([]);
    expect(state.history.past).toHaveLength(0);
  });

  it('is put down by the other two cards', () => {
    useDesignStore.getState().chooseEmptyStart();
    useDesignStore.getState().setMode('design_only');
    expect(useDesignStore.getState().emptyStart).toBe(false);
    useDesignStore.getState().chooseEmptyStart();
    useDesignStore.getState().setMode('full');
    expect(useDesignStore.getState().emptyStart).toBe(false);
    expect(useDesignStore.getState().mode).toBe('full');
  });
});

describe('the style’s floors and walls', () => {
  // The modern style's own laminate, plaster and tiles: the products its look is made of.
  const look = getStyle('modern').surfaces;
  const finish = (id: number, textureUrl: string | undefined, surfaces: Array<'floor' | 'wall'>, wet = false): CatalogProduct =>
    ({ ...paint(id), textureUrl: textureUrl ?? null, pricePerUnit: 10 + id, specs: { surfaces, wet } }) as CatalogProduct;
  const catalog = [
    finish(21, look.floor.textureUrl, ['floor']),
    finish(22, look.wall.textureUrl, ['wall']),
    finish(23, look.wetFloor.textureUrl, ['floor'], true),
    finish(24, look.wetWall.textureUrl, ['wall'], true),
  ];
  const onRoom = (surface: 'floor' | 'wall') => useDesignStore.getState().finishes.find((f) => f.roomId === 'r1' && f.surface === surface && f.wallIndex == null && !f.cells);

  it('lays them as the products they are when the flat is generated, and keeps a floor somebody chose', () => {
    useDesignStore.getState().setStyle('modern', catalog);
    expect(onRoom('floor')?.product?.productId).toBe(21);
    expect(onRoom('wall')).toMatchObject({ origin: 'style', product: { productId: 22, qty: 39.2 } });

    useDesignStore.getState().setFinish(['r1'], 'floor', paint(9));
    useDesignStore.getState().generate(catalog);
    expect(onRoom('floor')?.product?.productId).toBe(9);
    expect(onRoom('wall')?.product?.productId).toBe(22);
    // …and so they are in the budget of a renovation: 12 m² of floor, 39.2 m² of wall.
    const state = useDesignStore.getState();
    const cost = priceScene(state.plan!, { ...state.scene(), mode: 'full' }, { homeState: 'black_frame' });
    expect(cost.lines.filter((l) => l.section === 'finishes').map((l) => [l.product?.productId, l.qty])).toEqual([
      [22, 39.2],
      [9, 12],
    ]);
  });

  it('puts the style’s product back for “the style’s own”', () => {
    useDesignStore.getState().setFinish(['r1'], 'wall', paint(9));
    useDesignStore.getState().setFinish(['r1'], 'wall', null, catalog);
    expect(onRoom('wall')).toMatchObject({ origin: 'style', product: { productId: 22 } });
  });

  it('counts a finish again when its room is made bigger', () => {
    useDesignStore.getState().setFinish(['r1'], 'floor', paint(9));
    expect(onRoom('floor')?.product?.qty).toBe(12);
    useDesignStore.getState().resizeRoom('r1', 5, 4);
    expect(onRoom('floor')?.product).toMatchObject({ qty: 20, totalPrice: 240 });
  });

  it('gives the empty start its products once the catalogue is here, as no step of the history', () => {
    useDesignStore.getState().startEmpty();
    expect(onRoom('floor')?.product ?? null).toBeNull();
    const past = useDesignStore.getState().history.past.length;
    useDesignStore.getState().ensureFinishProducts(catalog);
    expect(onRoom('floor')?.product?.productId).toBe(21);
    expect(onRoom('wall')?.product?.productId).toBe(22);
    expect(useDesignStore.getState().history.past).toHaveLength(past);
  });

  it('tiles a room retyped as a bathroom', () => {
    useDesignStore.getState().setStyle('modern', catalog);
    useDesignStore.getState().updateRoom('r1', { type: 'bathroom' });
    useDesignStore.getState().ensureFinishProducts(catalog);
    expect(onRoom('floor')?.product?.productId).toBe(23);
    expect(onRoom('wall')?.product?.productId).toBe(24);
  });
});
