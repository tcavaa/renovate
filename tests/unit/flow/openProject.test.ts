import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { FloorPlan, DesignScene, PlacedItem } from '@/lib/design/types';
import type { Room } from '@/lib/calculator/types';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * Opening a project in the browser (`lib/flow/openProject`) and carrying a calculation into 3D:
 *
 *  - each half opens from this browser's cache when that is current (unsaved work, or at the
 *    row's revision) and from the row otherwise — with its locks, its step and where it was;
 *  - a project designed first opens in the calculator with the design's rooms and products;
 *  - "see it in 3D" lays out an empty design from the calculation, and never wipes a design
 *    the project already has: its plan, furniture and versions stay, the picks go into it.
 */

const memory = new Map<string, string>();
let flow: typeof import('@/lib/flow/openProject');
let sync: typeof import('@/lib/flow/projectSync');
let stores: { calc: typeof import('@/store/calculatorStore'); design: typeof import('@/store/designStore') };

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  });
  flow = await import('@/lib/flow/openProject');
  sync = await import('@/lib/flow/projectSync');
  stores = { calc: await import('@/store/calculatorStore'), design: await import('@/store/designStore') };
});

let nextId = 100;
beforeEach(() => {
  memory.clear();
  nextId += 10;
});

const calcRoom = (id: string, x: number): Room => ({ id, type: 'living_room', nameKa: id, width: 4, length: 3, height: 2.7, floorM2: 12, wallM2: 37.8, ceilingM2: 12, perimeterM: 14, isWetRoom: false, x, z: 0 });

const planOf = (ids: string[], source: FloorPlan['source'] = 'manual'): FloorPlan => ({
  rooms: ids.map((id, i) =>
    refreshRoom({
      id,
      type: 'living_room',
      name: id,
      polygon: [
        { x: i * 4, z: 0 },
        { x: i * 4 + 4, z: 0 },
        { x: i * 4 + 4, z: 3 },
        { x: i * 4, z: 3 },
      ],
      heightM: 2.7,
      areaM2: 0,
      perimeterM: 0,
      openings: [],
    })
  ),
  metresPerPixel: null,
  bounds: { width: ids.length * 4, depth: 3 },
  source,
  wallThicknessM: 0.12,
});

const sofa = (id: string, roomId: string, productId: number): PlacedItem => ({
  id,
  roomId,
  slot: 'sofa',
  kind: 'sofa_3seat',
  position: { x: 2, z: 1 },
  elevationM: 0,
  rotation: 0,
  size: { width: 2, depth: 0.9, height: 0.8 },
  product: { productId, nameKa: 'sofa', pricePerUnit: 900, unit: 'piece', qty: 1, totalPrice: 900, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/m.glb', categorySlug: 'sofas', store: null } as unknown as PlacedItem['product'],
});

const scene = (items: PlacedItem[], progress: DesignScene['progress']): DesignScene => ({ styleId: 'scandinavian', mode: 'design_only', budgetGel: null, items, finishes: [], electrical: [], styleProfile: null, progress });

function row(id: number, patch: Partial<SavedProjectInput>): SavedProjectInput {
  // As `savedProjectInput` has it: the design's progress is the scene's own when it recorded one.
  const designProgress = patch.designProgress ?? patch.scene?.progress ?? { step: 1, generated: false };
  return {
    id,
    nameKa: 'p',
    status: 'draft',
    updatedAt: 0,
    calculatorRev: 0,
    designRev: 0,
    rooms: [],
    homeState: null,
    selectedProducts: {},
    selectedFurniture: {},
    calculatorEdits: null,
    calculatorBoard: null,
    calculatorStarted: false,
    plan: null,
    scene: null,
    floorPlanUrl: null,
    versions: [],
    hasCalculator: false,
    hasDesign: false,
    calculatorPending: false,
    designPending: false,
    calculatorProgress: { step: 1, calculated: false },
    ...patch,
    designProgress,
  };
}

const calculation = (id: number, patch: Partial<SavedProjectInput> = {}) =>
  row(id, {
    rooms: [calcRoom('a', 0), calcRoom('b', 4)],
    homeState: 'black_frame',
    calculatorStarted: true,
    hasCalculator: true,
    calculatorBoard: { plan: planOf(['a', 'b']), floorPlanUrl: '/uploads/plans/x.png', finishes: [] },
    calculatorProgress: { step: 6, calculated: true, at: 5, steps: 6 },
    calculatorRev: 3,
    ...patch,
  });

const calc = (id: number) => stores.calc.useCalculatorStore.for(id).getState();
const board = (id: number) => stores.design.useCalculatorPlanStore.for(id).getState();
const design = (id: number) => stores.design.useDesignStore.for(id).getState();

describe('opening the calculation', () => {
  it('opens as saved — the drawing board, the lock and the page it was left on included', () => {
    const id = nextId;
    expect(flow.loadCalculatorHalf(calculation(id))).toBe('server');
    expect(calc(id)).toMatchObject({ projectId: id, homeState: 'black_frame', calculated: true, step: 6, at: 5 });
    expect(calc(id).rooms.map((r) => r.id)).toEqual(['a', 'b']);
    expect(board(id).plan?.rooms.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(board(id).floorPlanUrl).toBe('/uploads/plans/x.png');
    // The copy names the revision it was made from, beside its content.
    expect(calc(id).baseRev).toBe(3);
    expect(sync.isDirty('calculator', id)).toBe(false);
  });

  it('opens on this browser’s copy while it is at the row’s revision, and on the row once it is behind', () => {
    const id = nextId;
    flow.loadCalculatorHalf(calculation(id));
    calc(id).setChoices({ floor: 'parquet' });
    expect(flow.loadCalculatorHalf(calculation(id))).toBe('cache');
    expect(calc(id).choices.floor).toBe('parquet');
    // Saved from another computer since: the row wins.
    expect(flow.loadCalculatorHalf(calculation(id, { calculatorRev: 4 }))).toBe('server');
    expect(calc(id).choices.floor).toBeUndefined();
  });

  it('opens on unsaved work whatever the row says', () => {
    const id = nextId;
    flow.loadCalculatorHalf(calculation(id));
    calc(id).setChoices({ ceiling: 'barisol' });
    sync.markDirty('calculator', id);
    expect(flow.loadCalculatorHalf(calculation(id, { calculatorRev: 9 }))).toBe('cache');
    expect(calc(id).choices.ceiling).toBe('barisol');
  });

  it('keeps a drawing this browser has when the row has none, and marks it to be written', () => {
    const id = nextId;
    board(id).openBoard({ projectId: id, plan: planOf(['a', 'b']), floorPlanUrl: null, finishes: [] });
    flow.loadCalculatorHalf(calculation(id, { calculatorBoard: null }));
    expect(board(id).plan?.source).toBe('manual');
    expect(sync.isDirty('calculator', id)).toBe(true);
  });

  it('opens a renovation designed first on the materials, with the design’s rooms and products', () => {
    const id = nextId;
    const plan = planOf(['a', 'b']);
    flow.loadCalculatorHalf(row(id, { rooms: [calcRoom('a', 0), calcRoom('b', 4)], homeState: 'white_frame', hasCalculator: true, hasDesign: true, plan, scene: scene([sofa('s1', 'a', 7)], { step: 5, generated: true }) }));
    expect(calc(id)).toMatchObject({ homeState: 'white_frame', calculated: true, step: 3 });
    expect(calc(id).selectedFurniture.a?.[0]?.productId).toBe(7);
    // The design's plan on the board — and nothing of its furniture or finishes.
    expect(board(id).plan?.rooms.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(board(id).items).toEqual([]);
  });

  it('opens a design-only project on the first step, to choose a home state', () => {
    const id = nextId;
    flow.loadCalculatorHalf(row(id, { rooms: [calcRoom('a', 0)], homeState: null, hasDesign: true, plan: planOf(['a']), scene: scene([], { step: 5, generated: true }) }));
    expect(calc(id)).toMatchObject({ homeState: null, calculated: false, step: 1 });
  });

  it('opens a renovation designed first but not drawn yet on the first step, not as a calculation', () => {
    const id = nextId;
    flow.loadCalculatorHalf(row(id, { rooms: [], homeState: 'white_frame', hasCalculator: true, hasDesign: true, plan: planOf([]), scene: scene([], { step: 1, generated: false }) }));
    expect(calc(id)).toMatchObject({ calculated: false, step: 1 });
  });

  it('works a design-first calculation out from the row every time, until the calculator has changes of its own', () => {
    const id = nextId;
    const designFirst = (rooms: string[]) => row(id, { rooms: rooms.map((r, i) => calcRoom(r, i * 4)), homeState: 'white_frame', hasCalculator: true, hasDesign: true, plan: planOf(rooms), scene: scene([], { step: 5, generated: true }) });
    flow.loadCalculatorHalf(designFirst(['a', 'b']));
    // The studio added a room; the calculation has never been saved, so its revision did not move.
    expect(flow.loadCalculatorHalf(designFirst(['a', 'b', 'c']))).toBe('server');
    expect(calc(id).rooms).toHaveLength(3);
  });

  it('moves floors and walls from before every room took its own onto the rooms, and writes them once', () => {
    const id = nextId;
    const laminate = { productId: 7, nameKa: 'ლამინატი', pricePerUnit: 40, unit: 'm2' as const, qty: 30, totalPrice: 1200, imageUrl: null, categorySlug: 'laminate', surface: 'floor' as const };
    const finish = (roomId: string) => ({ roomId, surface: 'floor' as const, colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: { productId: 7, nameKa: 'x', slug: 'x', brand: null, pricePerUnit: 40, unit: 'm2', qty: 12, totalPrice: 480, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: 'laminate', store: null } });
    // Laid by hand on room a's floor only, on the placement step that is gone.
    const old = calculation(id, { selectedProducts: { 'laminate_item:7': laminate }, calculatorBoard: { plan: planOf(['a', 'b']), floorPlanUrl: null, finishes: [finish('a')] } });
    expect(flow.loadCalculatorHalf(old)).toBe('server');
    expect(Object.keys(calc(id).selectedProducts)).toEqual(['laminate_room:a']);
    expect(calc(id).selectedProducts['laminate_room:a']).toMatchObject({ roomId: 'a', surface: 'floor', qty: 13.2, totalPrice: 528 });
    expect(sync.isDirty('calculator', id)).toBe(true);
  });

  it('opens a project designed first with the studio’s floors as its rooms’ picks, and writes nothing', () => {
    const id = nextId;
    const floor = { roomId: 'a', surface: 'floor' as const, colorHex: '#fff', textureUrl: '/oak.jpg', textureScaleM: 1, product: { productId: 7, nameKa: 'x', slug: 'oak', brand: null, pricePerUnit: 40, unit: 'm2', qty: 12, totalPrice: 480, imageUrl: null, colorHex: null, textureUrl: '/oak.jpg', model3dUrl: null, categorySlug: 'laminate', store: null } };
    const designed = row(id, { rooms: [calcRoom('a', 0), calcRoom('b', 4)], hasDesign: true, plan: planOf(['a', 'b']), scene: { ...scene([], { step: 5, generated: true }), finishes: [floor] } });
    flow.loadCalculatorHalf(designed);
    expect(calc(id).selectedProducts['laminate_room:a']).toMatchObject({ roomId: 'a', surface: 'floor', qty: 13.2, textureUrl: '/oak.jpg' });
    expect(sync.isDirty('calculator', id)).toBe(false);
  });

  it('opens a new calculation on its first step', () => {
    const id = nextId;
    flow.loadCalculatorHalf(row(id, { calculatorStarted: true, hasCalculator: true, calculatorProgress: { step: 1, calculated: false, at: 1 } }));
    expect(calc(id)).toMatchObject({ projectId: id, homeState: null, calculated: false, step: 1 });
    expect(board(id).plan).toBeNull();
  });
});

describe('opening the design', () => {
  it('opens as saved, step 1’s answers and the page it was left on included', () => {
    const id = nextId;
    flow.loadDesignHalf(row(id, { hasDesign: true, plan: planOf([]), scene: scene([], { step: 1, generated: false, modeChosen: false, emptyStart: false, at: 1 }), designRev: 2 }));
    expect(design(id)).toMatchObject({ projectId: id, modeChosen: false, emptyStart: false, generated: false, at: 1 });
    expect(design(id).baseRev).toBe(2);
  });

  it('reads a scene saved before step 1’s answers were saved as answered', () => {
    const id = nextId;
    flow.loadDesignHalf(row(id, { hasDesign: true, plan: planOf(['a']), scene: scene([], { step: 5, generated: true }), designProgress: { step: 5, generated: true } }));
    expect(design(id)).toMatchObject({ modeChosen: true, emptyStart: false, generated: true, at: null });
  });

  it('the studio opens the calculation beside it; the calculator does not open the design', () => {
    const id = nextId;
    const both = calculation(id, { hasDesign: true, plan: planOf(['a', 'b']), scene: scene([], { step: 4, generated: false, planFromCalculator: true }) });
    expect(flow.openProjectStores('calculator', both)).toEqual({ calculator: 'server', design: null });
    expect(design(id).projectId).toBeNull();
    const other = nextId + 1;
    expect(flow.openProjectStores('design', { ...both, id: other })).toEqual({ calculator: 'server', design: 'server' });
    // A design carried in from the calculation applies the calculation's picks.
    expect(design(other).calculatorPicks).not.toBeNull();
  });
});

describe('carrying the calculation into 3D', () => {
  const ready = (id: number) => {
    flow.loadCalculatorHalf(calculation(id));
    flow.loadDesignHalf(calculation(id));
  };

  it('lays an empty design out from the calculation, with the plan steps shut', () => {
    const id = nextId;
    ready(id);
    expect(flow.handOffToDesign(id)).toBe('style');
    expect(design(id)).toMatchObject({ projectId: id, mode: 'full', homeState: 'black_frame', planFromCalculator: true, generated: false, step: 4 });
    expect(design(id).plan?.rooms.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(sync.isDirty('design', id)).toBe(true);
  });

  it('keeps a laid-out design — furniture, versions and its own walls — and sends the picks into it', () => {
    const id = nextId;
    ready(id);
    flow.handOffToDesign(id);
    const studioPlan = { ...planOf(['a', 'b', 'c']), source: 'manual' as const };
    stores.design.useDesignStore.for(id).setState({ plan: studioPlan, items: [sofa('s1', 'a', 7)], generated: true, versions: [{ id: 'v1', name: '01', kind: 'existing', createdAt: '', plan: studioPlan, scene: scene([], undefined) }] });
    expect(flow.handOffToDesign(id)).toBe('studio');
    const kept = design(id);
    expect(kept.items.map((i) => i.id)).toEqual(['s1']);
    expect(kept.versions.map((v) => v.id)).toEqual(['v1']);
    expect(kept.plan?.rooms.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(kept).toMatchObject({ generated: true, pendingPicks: true, mode: 'full' });
  });

  it('keeps a design that has rooms but was never laid out, and lets the generation apply the picks', () => {
    const id = nextId;
    ready(id);
    stores.design.useDesignStore.for(id).setState({ plan: planOf(['x']), generated: false, modeChosen: true });
    expect(flow.handOffToDesign(id)).toBe('resume');
    expect(design(id).plan?.rooms.map((r) => r.id)).toEqual(['x']);
    expect(design(id)).toMatchObject({ pendingPicks: false, mode: 'full' });
    expect(design(id).calculatorPicks).not.toBeNull();
  });

  it('rebuilds a design that is only the calculation’s copy, never laid out, from the calculation as it is now', () => {
    const id = nextId;
    ready(id);
    flow.handOffToDesign(id);
    // A technical point placed on the copy, then a room added to the calculation.
    stores.design.useDesignStore.for(id).getState().addTechnicalPoint('water_supply', { x: 1, z: 1 }, 'a');
    calc(id).setRooms([...calc(id).rooms, calcRoom('c', 8)]);
    expect(flow.handOffToDesign(id)).toBe('style');
    expect(design(id).plan?.rooms.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(design(id).plan?.technical?.points.map((p) => p.kind)).toEqual(['water_supply']);
  });

  it('carries nothing from a calculation that has no rooms or home state yet', () => {
    const id = nextId;
    flow.loadCalculatorHalf(row(id, { calculatorStarted: true, hasCalculator: true }));
    expect(flow.handOffToDesign(id)).toBeNull();
  });
});

describe('putting the calculator’s picks into a design', () => {
  it('never places a piece the room already holds, however often the picks come', async () => {
    const { applyFurniturePicks } = await import('@/lib/design/fromCalculator');
    const plan = planOf(['a']);
    const catalog = [{ id: 7, model3dKind: 'sofa_3seat', model3dUrl: '/m.glb', widthCm: 200, depthCm: 90, heightCm: 80, pricePerUnit: 900, nameKa: 'sofa', unit: 'piece' }] as never;
    const picks = { furniture: [{ roomId: 'a', productId: 7 }], productIds: [], roomProducts: [] };
    const once = applyFurniturePicks([], plan, picks, catalog);
    const twice = applyFurniturePicks(once, plan, picks, catalog);
    expect(once.filter((i) => i.product?.productId === 7)).toHaveLength(1);
    expect(twice.filter((i) => i.product?.productId === 7)).toHaveLength(1);
  });
});
