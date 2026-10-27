import { describe, expect, it } from 'vitest';
import { calculatorPickIds, refusedSceneChange, type SceneAllowance } from '@/lib/plans/sceneGuard';
import type { DesignScene, FloorPlan, PlacedItem, SurfaceFinish } from '@/lib/design/types';

const square = (x: number) => [
  { x, z: 0 },
  { x: x + 4, z: 0 },
  { x: x + 4, z: 4 },
  { x, z: 4 },
];
const plan = (patch: Partial<FloorPlan> = {}): FloorPlan =>
  ({
    rooms: [
      { id: 'r1', name: 'Living', type: 'living', polygon: square(0), areaM2: 16, openings: [{ id: 'd1', kind: 'door', wallIndex: 0, t: 0.5, widthM: 0.9, heightM: 2.1, product: { productId: 70 } }] },
      { id: 'r2', name: 'Bed', type: 'bedroom', polygon: square(4), areaM2: 16, openings: [] },
    ],
    metresPerPixel: null,
    bounds: { width: 8, depth: 4 },
    source: 'manual',
    imageUrl: null,
    ...patch,
  }) as unknown as FloorPlan;
const item = (id: string, productId: number, patch: Partial<PlacedItem> = {}): PlacedItem =>
  ({ id, roomId: 'r1', slot: 'sofa', position: { x: 1, z: 1 }, elevationM: 0, rotation: 0, size: { width: 2, depth: 1, height: 0.8 }, kind: 'sofa', product: { productId, price: 100 }, ...patch }) as unknown as PlacedItem;
const finish = (roomId: string, productId: number, patch: Partial<SurfaceFinish> = {}): SurfaceFinish =>
  ({ roomId, surface: 'floor', colorHex: '#ffffff', textureUrl: null, textureScaleM: 1, product: { productId, price: 30, qty: 16 }, ...patch }) as unknown as SurfaceFinish;
const scene = (patch: Partial<DesignScene> = {}): DesignScene =>
  ({
    styleId: 'scandinavian',
    mode: 'design_only',
    budgetGel: null,
    items: [item('a', 1), item('b', 2, { roomId: 'r2', position: { x: 5, z: 1 } })],
    finishes: [finish('r1', 10), finish('r2', 11)],
    decor: [{ id: 'k1', roomId: 'r1', family: 'slats', wallIndex: 0, span: { from: 0, to: 2 }, height: { from: 0, to: 2.5 }, params: {}, materials: { body: { product: { productId: 90 } } } }],
    generation: { by: 'engine', at: '2026-10-20T10:00:00Z' },
    progress: { step: 5, generated: true },
    ...patch,
  }) as unknown as DesignScene;

const FREE: SceneAllowance = { catalog: false, moveFurniture: false, picks: new Set() };
const stored = { plan: plan(), scene: scene() };
const check = (next: Partial<DesignScene>, nextPlan = plan(), allow = FREE) => refusedSceneChange(stored, { plan: nextPlan, scene: scene(next) }, allow);

describe('the studio locks on the server', () => {
  it('lets through a save that changes nothing it guards', () => {
    expect(check({})).toBeNull();
    // The budget's ticks, the wiring and prices are not the locks' (repriced snapshots differ).
    expect(check({ excluded: ['x'], electrical: [], finishes: [finish('r1', 10, { product: { productId: 10, price: 99 } as never }), finish('r2', 11)] })).toBeNull();
  });

  it('refuses a swap, an addition, a removal on a plan without the catalogue', () => {
    expect(check({ items: [item('a', 5), item('b', 2, { roomId: 'r2', position: { x: 5, z: 1 } })] })).toBe('catalog');
    expect(check({ items: [...scene().items, item('c', 3)] })).toBe('catalog');
    expect(check({ items: [item('a', 1)] })).toBe('catalog');
  });

  it('refuses a floor laid anew, decor changed or a door product swapped', () => {
    expect(check({ finishes: [finish('r1', 12), finish('r2', 11)] })).toBe('catalog');
    expect(check({ finishes: [finish('r1', 10), finish('r2', 11), finish('r1', 10, { cells: [[0, 0]] } as never)] })).toBe('catalog');
    expect(check({ decor: [] })).toBe('catalog');
    expect(check({ decor: [{ ...scene().decor![0], materials: { body: { product: { productId: 91 } } } } as never] })).toBe('catalog');
    const swapped = plan();
    (swapped.rooms[0].openings[0] as { product: unknown }).product = { productId: 71 };
    expect(check({}, swapped)).toBe('catalog');
  });

  it('refuses a material variant chosen on a plan without the catalogue', () => {
    const dressed = (variant: string | null) => item('a', 1, { product: { productId: 1, price: 100, ...(variant ? { variant: { id: variant } } : {}) } as never });
    expect(check({ items: [dressed('black'), scene().items[1]] })).toBe('catalog');
    expect(check({ items: [dressed('black'), scene().items[1]] }, plan(), { ...FREE, catalog: true })).toBeNull();
    expect(check({ items: [dressed(null), scene().items[1]] })).toBeNull();
  });

  it('refuses a piece moved, turned or mirrored without moving furniture', () => {
    expect(check({ items: [item('a', 1, { position: { x: 2, z: 1 } }), scene().items[1]] })).toBe('moveFurniture');
    expect(check({ items: [item('a', 1, { rotation: Math.PI / 2 }), scene().items[1]] })).toBe('moveFurniture');
    expect(check({ items: [item('a', 1, { mirrored: true }), scene().items[1]] })).toBe('moveFurniture');
  });

  it('lets everything through on a plan with both, or before the flat is laid out', () => {
    expect(check({ items: [] }, plan(), { catalog: true, moveFurniture: true, picks: new Set() })).toBeNull();
    const pending = { plan: plan(), scene: scene({ progress: { step: 4, generated: false } }) };
    expect(refusedSceneChange(pending, { plan: plan(), scene: scene({ items: [item('z', 99)], generation: { by: 'ai', at: '2026-10-20T11:00:00Z' } }) }, FREE)).toBeNull();
    expect(refusedSceneChange({ plan: null, scene: null }, { plan: plan(), scene: scene() }, FREE)).toBeNull();
  });

  it('refuses laying a laid-out flat out again, or making it unlaid', () => {
    expect(check({ generation: { by: 'engine', at: '2026-10-21T10:00:00Z' } })).toBe('catalog');
    expect(check({ progress: { step: 4, generated: false } })).toBe('catalog');
  });

  it('lets the designer\'s check change pieces once, right after the generation', () => {
    expect(check({ items: [item('a', 7, { position: { x: 3, z: 2 } })], decor: [], generation: { by: 'ai', at: '2026-10-20T10:00:00Z', reviewed: 2 } })).toBeNull();
  });

  it('lets in the calculator\'s picks, in place or added, and a floor picked there', () => {
    const allow = { ...FREE, picks: new Set([40, 41]) };
    expect(check({ items: [item('a', 40, { position: { x: 1.2, z: 1 } }), scene().items[1], item('c', 41)] }, plan(), allow)).toBeNull();
    expect(check({ finishes: [finish('r1', 41), finish('r2', 11)] }, plan(), allow)).toBeNull();
  });

  it('does not compare a room whose outline changed (a wall moved refits it)', () => {
    const moved = plan();
    moved.rooms[0] = { ...moved.rooms[0], polygon: [{ x: 0, z: 0 }, { x: 4.5, z: 0 }, { x: 4.5, z: 4 }, { x: 0, z: 4 }] };
    expect(check({ items: [item('a', 1, { position: { x: 1.3, z: 1 } }), scene().items[1]], finishes: [finish('r1', 10, { colorHex: '#eeeeee' }), finish('r2', 11)] }, moved)).toBeNull();
    // The room beside it still is.
    expect(check({ items: [scene().items[0], item('b', 2, { roomId: 'r2', position: { x: 6, z: 1 } })] }, moved)).toBe('moveFurniture');
  });

  it('lets a door be given its first product, and a kitchen material the studio chose itself', () => {
    const before = plan();
    (before.rooms[0].openings[0] as { product: unknown }).product = null;
    expect(refusedSceneChange({ plan: before, scene: scene() }, { plan: plan(), scene: scene() }, FREE)).toBeNull();
    const kitchen = (material: number, chosen?: boolean) => item('a', 1, { kitchenMaterial: { productId: material } as never, kitchenMaterialChosen: chosen });
    const withKitchen = { plan: plan(), scene: scene({ items: [kitchen(60), scene().items[1]] }) };
    expect(refusedSceneChange(withKitchen, { plan: plan(), scene: scene({ items: [kitchen(61), scene().items[1]] }) }, FREE)).toBeNull();
    expect(refusedSceneChange(withKitchen, { plan: plan(), scene: scene({ items: [kitchen(61, true), scene().items[1]] }) }, FREE)).toBe('catalog');
  });

  it('reads the calculator\'s picks off the project', () => {
    expect([...calculatorPickIds({ floor: { productId: 3 }, junk: 4 }, { r1: [{ productId: 5 }, { productId: 'x' }] })].sort()).toEqual([3, 5]);
    expect(calculatorPickIds(null, undefined).size).toBe(0);
  });
});
