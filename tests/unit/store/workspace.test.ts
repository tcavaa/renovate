import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRoomAreas } from '@/lib/calculator/materials';

/**
 * The two workspaces (`store/workspace`, `lib/flow/workspace`): the person's own journeys and
 * a project opened from "my projects" never share a copy; a save or an order closes a journey
 * so the header starts it again; letting go of a draft deletes it on the server — only a draft,
 * and only when the other journey is not working on the same row.
 */

type Mod = typeof import('@/lib/flow/workspace');
let flow: Mod;
let useCalculatorStore: typeof import('@/store/calculatorStore').useCalculatorStore;
let useDesignStore: typeof import('@/store/designStore').useDesignStore;
let useWorkspace: typeof import('@/store/workspace').useWorkspace;
const fetchMock = vi.fn();

beforeAll(async () => {
  const storage = () => {
    const memory = new Map<string, string>();
    return {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    };
  };
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('fetch', fetchMock);
  ({ useCalculatorStore } = await import('@/store/calculatorStore'));
  ({ useDesignStore } = await import('@/store/designStore'));
  ({ useWorkspace } = await import('@/store/workspace'));
  flow = await import('@/lib/flow/workspace');
  flow.watchFreshDrafts();
});

const room = computeRoomAreas({ id: 'r1', type: 'bedroom', nameKa: 'საძინებელი', width: 4, length: 5, height: 2.7 });
const deleted = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url as string);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: { status: 'draft' } }) });
  useWorkspace.getState().enterFresh();
  for (const store of [useCalculatorStore.fresh, useCalculatorStore.project, useDesignStore.fresh, useDesignStore.project]) store.getState().reset();
  fetchMock.mockClear();
});

describe('two workspaces', () => {
  it('keeps an opened project apart from the person’s own calculator', () => {
    useCalculatorStore.getState().setRooms([room]);
    useCalculatorStore.getState().setProjectId(7);
    flow.enterProjectWorkspace({ id: 40, name: 'Saved flat', status: 'saved' });
    expect(useCalculatorStore.getState().rooms).toEqual([]);
    useCalculatorStore.getState().openSavedProject({ projectId: 40, rooms: [room, room], homeState: 'white_frame', selectedProducts: {}, selectedFurniture: {} });
    expect(useCalculatorStore.getState().projectId).toBe(40);
    // The header's calculator is the person's own work, untouched.
    flow.enterFreshWorkspace();
    expect(useCalculatorStore.getState().projectId).toBe(7);
    expect(useCalculatorStore.getState().rooms).toHaveLength(1);
    // And the opened project is still there to go back to, not merged into it.
    expect(useCalculatorStore.project.getState().projectId).toBe(40);
  });

  it('opens a saved calculation with its first two steps shut and every step reached', () => {
    flow.enterProjectWorkspace({ id: 40, name: 'Saved flat', status: 'saved' });
    useCalculatorStore.getState().openSavedProject({ projectId: 40, rooms: [room], homeState: 'white_frame', selectedProducts: {}, selectedFurniture: {} });
    expect(useCalculatorStore.getState().calculated).toBe(true);
    expect(useCalculatorStore.getState().step).toBe(7);
    // A design-only project has no home state yet: the calculator starts at its beginning.
    useCalculatorStore.getState().openSavedProject({ projectId: 41, rooms: [room], homeState: null, selectedProducts: {}, selectedFurniture: {} });
    expect(useCalculatorStore.getState().calculated).toBe(false);
    expect(useCalculatorStore.getState().step).toBe(1);
  });

  it('empties the project workspace when another project is opened into it', () => {
    flow.enterProjectWorkspace({ id: 40, name: 'A', status: 'saved' });
    useCalculatorStore.getState().setRooms([room]);
    flow.enterProjectWorkspace({ id: 40, name: 'A', status: 'saved' });
    expect(useCalculatorStore.getState().rooms).toHaveLength(1);
    flow.enterProjectWorkspace({ id: 41, name: 'B', status: 'submitted' });
    expect(useCalculatorStore.getState().rooms).toEqual([]);
  });
});

describe('saving closes the journey', () => {
  it('starts the calculator again from the header once it was saved, and leaves an unrelated design alone', () => {
    useCalculatorStore.getState().setRooms([room]);
    useCalculatorStore.getState().setProjectId(7);
    useDesignStore.getState().setProjectId(9);
    flow.closeAfterSave('calculator', 7);
    // Still on screen until the person leaves…
    expect(useCalculatorStore.getState().rooms).toHaveLength(1);
    flow.enterFreshWorkspace();
    // …then gone; the design, another project, stays.
    expect(useCalculatorStore.getState().rooms).toEqual([]);
    expect(useDesignStore.getState().projectId).toBe(9);
  });

  it('closes both when the design saved is the calculation carried into 3D', () => {
    useCalculatorStore.getState().setRooms([room]);
    useCalculatorStore.getState().setProjectId(7);
    useDesignStore.getState().setProjectId(7);
    flow.closeAfterSave('design', 7);
    flow.enterFreshWorkspace();
    expect(useCalculatorStore.getState().projectId).toBeNull();
    expect(useDesignStore.getState().projectId).toBeNull();
  });

  it('does not close an opened project', () => {
    flow.enterProjectWorkspace({ id: 40, name: 'A', status: 'saved' });
    useCalculatorStore.getState().setProjectId(40);
    flow.closeAfterSave('calculator', 40);
    expect(useCalculatorStore.getState().closedProjectId).toBeNull();
  });
});

describe('one draft of each', () => {
  it('deletes the draft a fresh journey lets go of — asking the server for a draft only', () => {
    useCalculatorStore.getState().setProjectId(7);
    fetchMock.mockClear();
    useCalculatorStore.getState().reset();
    expect(deleted()).toEqual(['/api/projects/7?onlyDraft=1']);
  });

  it('keeps the row when the other journey is still working on it', () => {
    useCalculatorStore.getState().setProjectId(7);
    useDesignStore.getState().setProjectId(7);
    fetchMock.mockClear();
    useCalculatorStore.getState().reset();
    expect(deleted()).toEqual([]);
  });

  it('never deletes from the project workspace', () => {
    flow.enterProjectWorkspace({ id: 40, name: 'A', status: 'saved' });
    useCalculatorStore.getState().setProjectId(40);
    fetchMock.mockClear();
    useCalculatorStore.getState().reset();
    expect(deleted()).toEqual([]);
  });

  it('says when opening a draft would replace other unsaved work', () => {
    expect(flow.freshDraftInTheWay('calculator', 12)).toBe(false);
    useCalculatorStore.getState().setRooms([room]);
    useCalculatorStore.getState().setProjectId(7);
    expect(flow.freshDraftInTheWay('calculator', 12)).toBe(true);
    // The same draft is simply resumed.
    expect(flow.freshDraftInTheWay('calculator', 7)).toBe(false);
    expect(flow.freshHolds('calculator', 7)).toBe(true);
    // Work that was saved is not in the way: it starts again anyway.
    flow.closeAfterSave('calculator', 7);
    expect(flow.freshDraftInTheWay('calculator', 12)).toBe(false);
  });
});

describe('a calculation carried into 3D', () => {
  it('shuts the plan steps, which were done in the calculator, until another plan comes in', () => {
    const design = useDesignStore.getState();
    design.startFromCalculator({ rooms: [room], homeState: 'white_frame', selectedProducts: {}, selectedFurniture: {}, projectId: 7 });
    expect(useDesignStore.getState().planFromCalculator).toBe(true);
    const plan = useDesignStore.getState().plan!;
    useDesignStore.getState().setPlan(plan, null);
    expect(useDesignStore.getState().planFromCalculator).toBe(false);
  });
});

describe('after a save from the calculator', () => {
  it('leaves no drawing board behind to bring the saved flat back', async () => {
    const { useCalculatorPlanStore } = await import('@/store/designStore');
    const { resetFlow } = await import('@/lib/flow/reset');
    const { planFromCalculatorRooms } = await import('@/lib/design/planGeometry');
    useCalculatorStore.getState().setRooms([room]);
    useCalculatorPlanStore.getState().setPlan(planFromCalculatorRooms([room]), null);
    // The save dialogue's "to my projects".
    resetFlow('calculator');
    expect(useCalculatorPlanStore.getState().plan).toBeNull();
    // A browser left with a board and no calculation behind it is put right on the way in.
    useCalculatorPlanStore.getState().setPlan(planFromCalculatorRooms([room]), null);
    useCalculatorStore.getState().setRooms([room]);
    flow.enterFreshWorkspace();
    expect(useCalculatorPlanStore.getState().plan).toBeNull();
    expect(useCalculatorStore.getState().rooms).toEqual([]);
  });
});

describe('a draft reopens where it was left', () => {
  it('opens a calculation saved on the plan step as not calculated, on that step', () => {
    useCalculatorStore.getState().openSavedProject({ projectId: 50, rooms: [room], homeState: 'black_frame', selectedProducts: {}, selectedFurniture: {}, progress: { step: 2, calculated: false } });
    expect(useCalculatorStore.getState()).toMatchObject({ calculated: false, step: 2 });
    useCalculatorStore.getState().openSavedProject({ projectId: 51, rooms: [room], homeState: 'black_frame', selectedProducts: {}, selectedFurniture: {}, progress: { step: 5, calculated: true } });
    expect(useCalculatorStore.getState()).toMatchObject({ calculated: true, step: 5 });
    // Saved before progress was recorded: it was finished.
    useCalculatorStore.getState().openSavedProject({ projectId: 52, rooms: [room], homeState: 'black_frame', selectedProducts: {}, selectedFurniture: {} });
    expect(useCalculatorStore.getState()).toMatchObject({ calculated: true, step: 7 });
  });

  it('saves the design’s progress with its scene and opens a draft that was never generated as it was', () => {
    const design = useDesignStore.getState();
    design.startFromCalculator({ rooms: [room], homeState: 'white_frame', selectedProducts: {}, selectedFurniture: {}, projectId: 7 });
    const scene = useDesignStore.getState().scene();
    expect(scene.progress).toMatchObject({ generated: false, step: 4, planFromCalculator: true });
    const plan = useDesignStore.getState().plan!;
    useDesignStore.getState().reset();
    useDesignStore.getState().openSaved({ projectId: 60, plan, scene, floorPlanUrl: null, homeState: 'white_frame' });
    expect(useDesignStore.getState()).toMatchObject({ generated: false, step: 4, planFromCalculator: true });
    // A scene saved before progress was recorded was laid out.
    useDesignStore.getState().openSaved({ projectId: 61, plan, scene: { ...scene, progress: undefined }, floorPlanUrl: null, homeState: 'white_frame' });
    expect(useDesignStore.getState()).toMatchObject({ generated: true, step: 5 });
  });

  it('hands the calculator’s first step on to the plan only for an entry from outside', () => {
    flow.takeFreshEntry(); // whatever an earlier test's entry left
    expect(flow.takeFreshEntry()).toBe(false);
    flow.enterFreshWorkspace();
    expect(flow.takeFreshEntry()).toBe(true);
    // Used up: the back button to step 1 afterwards stays on step 1.
    expect(flow.takeFreshEntry()).toBe(false);
  });
});

describe('a half that is not done yet', () => {
  it('is read off the progress saved with it, and a project saved before that is done', async () => {
    const { projectKind } = await import('@/lib/projects/saved');
    const base = { plan: null, selectedProducts: {}, mode: 'design_only' as const, scene: null };
    expect(projectKind({ ...base, calculatorEdits: { progress: { step: 2, calculated: false } } })).toMatchObject({ hasCalculator: true, calculatorPending: true });
    expect(projectKind({ ...base, calculatorEdits: { progress: { step: 5, calculated: true } } }).calculatorPending).toBe(false);
    expect(projectKind({ ...base, calculatorEdits: null }).calculatorPending).toBe(false);
    const scene = (generated?: boolean) => ({ styleId: 'modern', mode: 'full', budgetGel: null, items: [], finishes: [], ...(generated === undefined ? {} : { progress: { step: 4, generated } }) });
    expect(projectKind({ ...base, selectedProducts: null, plan: {} as never, scene: scene(false) as never, calculatorEdits: null })).toMatchObject({ hasDesign: true, designPending: true, calculatorPending: false });
    expect(projectKind({ ...base, selectedProducts: null, plan: {} as never, scene: scene() as never, calculatorEdits: null }).designPending).toBe(false);
  });
});

describe('a draft saved before its progress was recorded', () => {
  it('counts as calculated only when products were picked, as generated only when furnished', async () => {
    const { calculatorProgress, designProgress, projectKind } = await import('@/lib/projects/saved');
    // Saved or ordered: finished.
    expect(calculatorProgress({ status: 'saved', calculatorEdits: null, selectedProducts: {}, selectedFurniture: {} })).toEqual({ step: 7, calculated: true });
    // A draft with nothing picked: back to the plan step, not calculated — and shown without figures.
    expect(calculatorProgress({ status: 'draft', calculatorEdits: null, selectedProducts: {}, selectedFurniture: {} })).toEqual({ step: 2, calculated: false });
    expect(projectKind({ plan: null, mode: 'full', status: 'draft', calculatorEdits: null, selectedProducts: {}, selectedFurniture: {} }).calculatorPending).toBe(true);
    // A draft with a pick: it was calculated (picking comes after).
    const pick = { productId: 1, nameKa: 'x', pricePerUnit: 1, unit: 'm2' as const, qty: 1, totalPrice: 1, imageUrl: null };
    expect(calculatorProgress({ status: 'draft', calculatorEdits: null, selectedProducts: { laminate_global: pick }, selectedFurniture: {} }).calculated).toBe(true);
    // Recorded progress always wins.
    expect(calculatorProgress({ status: 'saved', calculatorEdits: { progress: { step: 2, calculated: false } }, selectedProducts: {}, selectedFurniture: {} }).calculated).toBe(false);
    const scene = (items: number) => ({ styleId: 'modern', mode: 'full', budgetGel: null, items: Array.from({ length: items }, () => ({})), finishes: [] });
    expect(designProgress({ status: 'draft', scene: scene(0) as never })).toEqual({ step: 4, generated: false });
    expect(designProgress({ status: 'draft', scene: scene(3) as never }).generated).toBe(true);
    expect(designProgress({ status: 'submitted', scene: scene(0) as never }).generated).toBe(true);
  });
});
