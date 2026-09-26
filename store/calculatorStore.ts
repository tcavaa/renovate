'use client';

import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/flow/storage';
import { projectScopedStore } from './projectScope';
import { z } from 'zod';
import { calculatorRequestSchema, homeStateEnum } from '@/lib/validations/room.schema';
import { withRoomFinish, withRoomFinishQuantities, type FinishSurface } from '@/lib/calculator/roomFinishes';
import { CALCULATOR_STEPS, fromSevenSteps } from '@/lib/calculator/steps';
import { tickedOff, toggleTick, withQuantity, type Quantities, type Tick } from '@/lib/design/ticks';
import { effectiveExcluded } from '@/lib/summary/calculatorSheet';
import type {
  CalculatorState,
  CalculatorStepNumber,
  HomeState,
  Room,
  SelectedProduct,
  WorkChoices,
} from '@/lib/calculator/types';

interface CalculatorStore extends CalculatorState {
  /** The saved project this calculation belongs to, so saving again writes into the same row. */
  projectId: number | null;
  setProjectId: (id: number | null) => void;
  /**
   * The calculation's revision on the server this copy was made from (`projects.calculator_rev`):
   * what a save names, so one made from an older copy than the row's is refused. It lives with
   * the content, so every tab and every reload carries the revision of its own copy.
   */
  baseRev: number | null;
  /** A save sent and not yet confirmed: if it landed, the next save is not a conflict with itself. */
  pendingSaveId: string | null;
  /**
   * The estimate has been worked out, so the flat and its condition are settled.
   *
   * Everything after — materials, products, furniture, the summary — is still open, but
   * going back to redraw the rooms or change the home state would pull the ground out from
   * under every quantity and every pick made since. Starting again is a new project, not a
   * click on the step strip.
   */
  calculated: boolean;
  /** Marks the calculation as worked out; called when step 1 is left. */
  setCalculated: () => void;
  /**
   * The step whose page was open last — where the project reopens (`lib/flow/resume`). `step`
   * is how far the journey got; this is where the person was. Saved with the project.
   */
  at: CalculatorStepNumber | null;
  setAt: (step: CalculatorStepNumber) => void;
  /**
   * What the person made of the estimate on the summary: lines ticked out of the order, and
   * quantities of their own, by line key (`lib/design/ticks`) — a material, a labour phase, a
   * pick, a piece of furniture alike. The estimate itself is never touched: it is worked out
   * again from the rooms and the picks, and stands beside each edit as the original.
   */
  excluded: Tick[];
  quantities: Quantities;
  /** Puts one line in or out of the order. */
  toggleExcluded: (tick: string) => void;
  /** A whole store's lines, or a whole kind's, in or out together. */
  setLinesExcluded: (ticks: string[], excluded: boolean) => void;
  /** Sets one line's quantity; `null` — or the quantity that was worked out — lets go of the edit. */
  setQuantity: (tick: string, qty: number | null, original?: number) => void;
  /** Every tick and every quantity back to what was worked out. */
  clearEdits: () => void;
  /** Laminate or parquet, plasterboard or a stretch ceiling — which labour the estimate prices. */
  choices: Partial<WorkChoices>;
  setChoices: (choices: Partial<WorkChoices>) => void;
  /** Counts the loads of a saved project into this store; the autosave does not write back what was just loaded (`useAutosave`). Not persisted. */
  loadSerial: number;
  /** What the autosave is doing right now. Not persisted. */
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  setSaveState: (state: CalculatorStore['saveState']) => void;
  /** Opens a saved project's rooms and picks for (re)calculation — the "calculate costs" button. */
  openSavedProject: (input: {
    projectId: number;
    rooms: Room[];
    homeState: HomeState | null;
    selectedProducts: Record<string, SelectedProduct>;
    selectedFurniture: Record<string, SelectedProduct[]>;
    edits?: { excluded?: Tick[]; quantities?: Quantities; choices?: Partial<WorkChoices> } | null;
    /** How far the journey got when it was saved; absent on projects saved before it was recorded, which were finished. */
    progress?: { step: number; calculated: boolean; at?: number | null } | null;
  }) => void;
  setHomeState: (state: HomeState) => void;
  addRoom: (room: Room) => void;
  /** Rooms read off an uploaded plan replace whatever was typed; furniture picks per room go with them. */
  setRooms: (rooms: Room[]) => void;
  /** A new plan for the same project: rooms replaced, every product and furniture pick dropped. */
  replaceRooms: (rooms: Room[]) => void;
  /** Layout editor: a room moved on the plan. */
  moveRoom: (id: string, x: number, z: number) => void;
  /** Layout editor: a room moved up or down the list. */
  reorderRoom: (id: string, direction: -1 | 1) => void;
  updateRoom: (id: string, room: Partial<Room>) => void;
  removeRoom: (id: string) => void;
  setStep: (step: CalculatorStepNumber) => void;
  selectProduct: (key: string, product: SelectedProduct) => void;
  /**
   * The floor or the walls of each of `roomIds` in `product` — one product per room and
   * surface, whatever category it is from — or that surface of theirs cleared with null
   * (`lib/calculator/roomFinishes`). The quantity is each room's own area in the product's
   * units, worked out here and again by the server; `product` carries its `categorySlug`.
   */
  setRoomFinish: (roomIds: string[], surface: FinishSurface, product: SelectedProduct | null) => void;
  removeProduct: (key: string) => void;
  addFurniture: (roomId: string, product: SelectedProduct) => void;
  removeFurniture: (roomId: string, productId: number) => void;
  reset: () => void;
}

/** Bump when the persisted shape changes — see the Persistence section at the bottom. */
const PERSIST_VERSION = 4;

type Persisted = CalculatorState & { projectId: number | null; baseRev: number | null; pendingSaveId: string | null; calculated: boolean; at: CalculatorStepNumber | null; excluded: Tick[]; quantities: Quantities; choices: Partial<WorkChoices> };

const initial: Persisted = {
  homeState: null,
  rooms: [],
  selectedProducts: {},
  selectedFurniture: {},
  step: 1,
  projectId: null,
  baseRev: null,
  pendingSaveId: null,
  calculated: false,
  at: null,
  excluded: [],
  quantities: {},
  choices: {},
};

const clampStep = (step: number): CalculatorStepNumber => Math.min(CALCULATOR_STEPS, Math.max(1, Math.round(step))) as CalculatorStepNumber;

/**
 * The first version of the summary's ticks was a flag on the pick itself. They are line keys
 * now, like every other line's; a flag found in stored state becomes the key it meant.
 */
function liftFlags<T extends Pick<Persisted, 'selectedProducts' | 'selectedFurniture' | 'excluded'>>(state: T): T {
  const flagged = Object.values(state.selectedProducts).some((p) => p.excluded) || Object.values(state.selectedFurniture).some((list) => list.some((p) => p.excluded));
  if (!flagged) return state;
  const strip = ({ excluded: _flag, ...pick }: SelectedProduct): SelectedProduct => pick;
  return {
    ...state,
    excluded: [...new Set(effectiveExcluded(state, { excluded: state.excluded }))],
    selectedProducts: Object.fromEntries(Object.entries(state.selectedProducts).map(([k, p]) => [k, strip(p)])),
    selectedFurniture: Object.fromEntries(Object.entries(state.selectedFurniture).map(([k, list]) => [k, list.map(strip)])),
  };
}

type CalculatorStoreHook = UseBoundStore<StoreApi<CalculatorStore>>;

/** One project's calculator; `storageName` null makes one kept in memory only (outside a project, tests). */
function createCalculatorStore(storageName: string | null): CalculatorStoreHook {
  const creator: StateCreator<CalculatorStore> = (set) => ({
      ...initial,
      saveState: 'idle',
      loadSerial: 0,
      setSaveState: (saveState) => set({ saveState }),
      setProjectId: (projectId) => set({ projectId }),
      setCalculated: () => set({ calculated: true }),
      setAt: (at) => set((s) => (s.at === at ? s : { at })),
      toggleExcluded: (tick) => set((s) => ({ excluded: toggleTick(s.excluded, tick) })),
      setLinesExcluded: (ticks, excluded) =>
        set((s) => {
          if (!excluded) {
            const back = new Set<Tick>(ticks);
            return { excluded: s.excluded.filter((t) => !back.has(t)) };
          }
          const isOut = tickedOff(s.excluded);
          return { excluded: [...s.excluded, ...ticks.filter((t) => !isOut(t))] };
        }),
      setQuantity: (tick, qty, original) => set((s) => ({ quantities: withQuantity(s.quantities, tick, qty, original) })),
      clearEdits: () => set({ excluded: [], quantities: {} }),
      setChoices: (choices) => set((s) => ({ choices: { ...s.choices, ...choices } })),
      openSavedProject: ({ projectId, rooms, homeState, selectedProducts, selectedFurniture, edits, progress }) =>
        set((s) => ({
          ...liftFlags({
            projectId,
            rooms,
            homeState,
            selectedProducts,
            selectedFurniture,
            excluded: edits?.excluded ?? [],
            quantities: edits?.quantities ?? {},
            choices: edits?.choices ?? {},
            // No home state yet is a project still on its first step, whatever else it holds.
            ...(!homeState
              ? { calculated: false, step: 1 as const, at: null }
              : progress
                ? { calculated: progress.calculated, step: clampStep(progress.step), at: progress.at != null ? clampStep(progress.at) : null }
                : { calculated: true, step: CALCULATOR_STEPS as CalculatorStepNumber, at: null }),
          }),
          loadSerial: s.loadSerial + 1,
        })),
      setHomeState: (homeState) => set({ homeState }),
      addRoom: (room) => set((s) => ({ rooms: [...s.rooms, room] })),
      setRooms: (rooms) =>
        set((s) => {
          const keep = new Set(rooms.map((r) => r.id));
          const selectedFurniture = Object.fromEntries(
            Object.entries(s.selectedFurniture).filter(([roomId]) => keep.has(roomId))
          );
          // A room's floor and walls are counted from the room: resized, they are counted again;
          // gone, they go with it.
          const selectedProducts = withRoomFinishQuantities(s.selectedProducts, rooms);
          return { rooms, selectedFurniture, ...(selectedProducts !== s.selectedProducts ? { selectedProducts } : {}) };
        }),
      // A new plan inside the same project: what was picked for the old rooms goes with them.
      replaceRooms: (rooms) => set({ rooms, selectedProducts: {}, selectedFurniture: {}, excluded: [], quantities: {}, calculated: false }),
      moveRoom: (id, x, z) => set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, x, z } : r)) })),
      reorderRoom: (id, direction) =>
        set((s) => {
          const index = s.rooms.findIndex((r) => r.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= s.rooms.length) return {};
          const rooms = [...s.rooms];
          [rooms[index], rooms[target]] = [rooms[target], rooms[index]];
          return { rooms };
        }),
      updateRoom: (id, updates) =>
        set((s) => {
          const rooms = s.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r));
          const selectedProducts = withRoomFinishQuantities(s.selectedProducts, rooms);
          return { rooms, ...(selectedProducts !== s.selectedProducts ? { selectedProducts } : {}) };
        }),
      removeRoom: (id) =>
        set((s) => {
          const next = { ...s.selectedFurniture };
          delete next[id];
          const rooms = s.rooms.filter((r) => r.id !== id);
          return {
            rooms,
            selectedFurniture: next,
            selectedProducts: withRoomFinishQuantities(s.selectedProducts, rooms),
          };
        }),
      setStep: (step) => set({ step }),
      selectProduct: (key, product) =>
        set((s) => ({
          selectedProducts: { ...s.selectedProducts, [key]: product },
        })),
      setRoomFinish: (roomIds, surface, product) => set((s) => ({ selectedProducts: withRoomFinish(s.selectedProducts, s.rooms, roomIds, surface, product) })),
      removeProduct: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.selectedProducts;
          return { selectedProducts: rest };
        }),
      addFurniture: (roomId, product) =>
        set((s) => ({
          selectedFurniture: {
            ...s.selectedFurniture,
            [roomId]: [...(s.selectedFurniture[roomId] ?? []), product],
          },
        })),
      removeFurniture: (roomId, productId) =>
        set((s) => ({
          selectedFurniture: {
            ...s.selectedFurniture,
            [roomId]: (s.selectedFurniture[roomId] ?? []).filter(
              (p) => p.productId !== productId
            ),
          },
        })),
      reset: () => set({ ...initial }),
    });
  if (!storageName) return create<CalculatorStore>()(creator);
  return create<CalculatorStore>()(
    persist(creator, {
      name: storageName,
      // A full localStorage never breaks the page (`lib/flow/storage`).
      storage: createJSONStorage(() => safeLocalStorage),
      version: PERSIST_VERSION,
      migrate: migratePersisted,
      merge: (persisted, current) => liftFlags({ ...current, ...(persisted as Partial<Persisted>) }),
      // The autosave's status is a fact about this session, not about the project.
      partialize: (s) => ({
        homeState: s.homeState,
        rooms: s.rooms,
        selectedProducts: s.selectedProducts,
        selectedFurniture: s.selectedFurniture,
        step: s.step,
        projectId: s.projectId,
        calculated: s.calculated,
        excluded: s.excluded,
        quantities: s.quantities,
        choices: s.choices,
        at: s.at,
        baseRev: s.baseRev,
        pendingSaveId: s.pendingSaveId,
      }),
    })
  ) as unknown as CalculatorStoreHook;
}

/** One calculator per project (`store/projectScope`): the pages read the open project's. */
export const useCalculatorStore = projectScopedStore('renovate-calculator', createCalculatorStore);

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Bump when the persisted shape changes; older or malformed state is dropped, not guessed at. */
const selectedProductSchema = z.object({
  productId: z.number().int(),
  nameKa: z.string(),
  nameEn: z.string().nullable().optional(),
  nameRu: z.string().nullable().optional(),
  pricePerUnit: z.number(),
  unit: z.string(),
  qty: z.number(),
  totalPrice: z.number(),
  imageUrl: z.string().nullable(),
  categorySlug: z.string().optional(),
  roomId: z.string().optional(),
  excluded: z.boolean().optional(),
  // A finish in the cart carries what the placement board needs (see `SelectedProduct`).
  surface: z.enum(['floor', 'wall']).optional(),
  slug: z.string().optional(),
  textureUrl: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  coveragePerUnit: z.number().nullable().optional(),
  specs: z.unknown().optional(),
});

const persistedSchema = z.object({
  homeState: homeStateEnum.nullable(),
  rooms: calculatorRequestSchema.shape.rooms.element.array(),
  selectedProducts: z.record(selectedProductSchema),
  selectedFurniture: z.record(z.array(selectedProductSchema)),
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  projectId: z.number().int().positive().nullable().optional(),
  calculated: z.boolean().optional(),
  excluded: z.array(z.union([z.string(), z.number()])).optional(),
  quantities: z.record(z.number()).optional(),
  choices: z.object({ floor: z.enum(['laminate', 'parquet']), ceiling: z.enum(['gypsum', 'barisol']) }).partial().optional(),
  at: z.number().int().min(1).max(6).nullable().optional(),
  baseRev: z.number().int().nullable().optional(),
  pendingSaveId: z.string().nullable().optional(),
});

function migratePersisted(persisted: unknown, version: number): Persisted {
  // Version 1 had five steps; the placement step went in as the fourth, so a journey that
  // had reached the furniture (4) or the summary (5) is one further on now (version 2).
  // Version 3 put the plan on a step of its own, the second, so everything from the
  // materials on is one further on again — seven steps. Version 4 took the placement out
  // again (the catalogue finishes each room itself): six steps, `fromSevenSteps`.
  if (!persisted || typeof persisted !== 'object') return { ...initial };
  const old = persisted as { step?: number; at?: number | null };
  let step = typeof old.step === 'number' ? old.step : 1;
  let at = typeof old.at === 'number' ? old.at : null;
  if (version === 1) step = step >= 4 ? step + 1 : step;
  if (version === 1 || version === 2) step = step >= 2 ? step + 1 : step;
  if (version >= 1 && version <= 3) {
    step = fromSevenSteps(step);
    at = at != null ? fromSevenSteps(at) : null;
  } else if (version !== PERSIST_VERSION) return { ...initial };
  persisted = { ...old, step, at };
  const parsed = persistedSchema.safeParse(persisted);
  if (!parsed.success) return { ...initial };
  return {
    ...initial,
    ...parsed.data,
    projectId: parsed.data.projectId ?? null,
    calculated: parsed.data.calculated ?? false,
    excluded: parsed.data.excluded ?? [],
    quantities: parsed.data.quantities ?? {},
    choices: parsed.data.choices ?? {},
    at: parsed.data.at != null ? clampStep(parsed.data.at) : null,
    baseRev: parsed.data.baseRev ?? null,
    pendingSaveId: parsed.data.pendingSaveId ?? null,
    rooms: parsed.data.rooms as Room[],
    selectedProducts: parsed.data.selectedProducts as Record<string, SelectedProduct>,
    selectedFurniture: parsed.data.selectedFurniture as Record<string, SelectedProduct[]>,
  };
}
