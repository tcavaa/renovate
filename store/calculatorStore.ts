'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { z } from 'zod';
import { calculatorRequestSchema, homeStateEnum } from '@/lib/validations/room.schema';
import { categorySlugFromKey, roomIdFromKey, selectionKey } from '@/lib/calculator/quantities';
import { tickedOff, toggleTick, withQuantity, type Quantities, type Tick } from '@/lib/design/ticks';
import { effectiveExcluded } from '@/lib/summary/calculatorSheet';
import type {
  CalculatorState,
  HomeState,
  Room,
  SelectedProduct,
} from '@/lib/calculator/types';

interface CalculatorStore extends CalculatorState {
  /** The saved project this calculation belongs to, so saving again writes into the same row. */
  projectId: number | null;
  setProjectId: (id: number | null) => void;
  /**
   * The estimate has been worked out, so the flat and its condition are settled.
   *
   * Everything after — materials, products, furniture, the summary — is still open, but
   * going back to redraw the rooms or change the home state would pull the ground out from
   * under every quantity and every pick made since. Starting over is deliberate
   * (`StartOverButton`), not a click on the step strip.
   */
  calculated: boolean;
  /** Marks the calculation as worked out; called when step 1 is left. */
  setCalculated: () => void;
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
    edits?: { excluded?: Tick[]; quantities?: Quantities } | null;
  }) => void;
  setHomeState: (state: HomeState) => void;
  addRoom: (room: Room) => void;
  /** Rooms read off an uploaded plan replace whatever was typed; furniture picks per room go with them. */
  setRooms: (rooms: Room[]) => void;
  /** A new plan is a new project: rooms replaced, every product and furniture pick dropped. */
  replaceRooms: (rooms: Room[]) => void;
  /** Layout editor: a room moved on the plan. */
  moveRoom: (id: string, x: number, z: number) => void;
  /** Layout editor: a room moved up or down the list. */
  reorderRoom: (id: string, direction: -1 | 1) => void;
  updateRoom: (id: string, room: Partial<Room>) => void;
  removeRoom: (id: string) => void;
  setStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  selectProduct: (key: string, product: SelectedProduct) => void;
  /**
   * A finish for the whole flat or for one room. Within a category the two are exclusive:
   * picking "the same everywhere" drops the per-room picks, picking for a room drops the
   * whole-flat one — so a laminate is never counted twice for the same floor.
   */
  selectFinish: (categorySlug: string, roomId: string | null, product: SelectedProduct) => void;
  removeProduct: (key: string) => void;
  addFurniture: (roomId: string, product: SelectedProduct) => void;
  removeFurniture: (roomId: string, productId: number) => void;
  reset: () => void;
}

/** Bump when the persisted shape changes — see the Persistence section at the bottom. */
const PERSIST_VERSION = 1;

type Persisted = CalculatorState & { projectId: number | null; calculated: boolean; excluded: Tick[]; quantities: Quantities };

const initial: Persisted = {
  homeState: null,
  rooms: [],
  selectedProducts: {},
  selectedFurniture: {},
  step: 1,
  projectId: null,
  calculated: false,
  excluded: [],
  quantities: {},
};

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

export const useCalculatorStore = create<CalculatorStore>()(
  persist(
    (set) => ({
      ...initial,
      saveState: 'idle',
      setSaveState: (saveState) => set({ saveState }),
      setProjectId: (projectId) => set({ projectId }),
      setCalculated: () => set({ calculated: true }),
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
      openSavedProject: ({ projectId, rooms, homeState, selectedProducts, selectedFurniture, edits }) =>
        set(liftFlags({ projectId, rooms, homeState, selectedProducts, selectedFurniture, excluded: edits?.excluded ?? [], quantities: edits?.quantities ?? {}, step: 1 as const })),
      setHomeState: (homeState) => set({ homeState }),
      addRoom: (room) => set((s) => ({ rooms: [...s.rooms, room] })),
      setRooms: (rooms) =>
        set((s) => {
          const keep = new Set(rooms.map((r) => r.id));
          const selectedFurniture = Object.fromEntries(
            Object.entries(s.selectedFurniture).filter(([roomId]) => keep.has(roomId))
          );
          return { rooms, selectedFurniture };
        }),
      // A new plan is a new project — including on the server: the next save gets its own row.
      replaceRooms: (rooms) => set({ rooms, selectedProducts: {}, selectedFurniture: {}, excluded: [], quantities: {}, projectId: null, calculated: false }),
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
        set((s) => ({
          rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
      removeRoom: (id) =>
        set((s) => {
          const next = { ...s.selectedFurniture };
          delete next[id];
          return {
            rooms: s.rooms.filter((r) => r.id !== id),
            selectedFurniture: next,
          };
        }),
      setStep: (step) => set({ step }),
      selectProduct: (key, product) =>
        set((s) => ({
          selectedProducts: { ...s.selectedProducts, [key]: product },
        })),
      selectFinish: (categorySlug, roomId, product) =>
        set((s) => {
          const next: Record<string, SelectedProduct> = {};
          for (const [key, value] of Object.entries(s.selectedProducts)) {
            if (categorySlugFromKey(key) !== categorySlug) {
              next[key] = value;
              continue;
            }
            const keyRoom = roomIdFromKey(key);
            // Whole-flat pick clears every room pick; a room pick clears the whole-flat one.
            if (roomId ? keyRoom !== null : false) next[key] = value;
          }
          next[selectionKey(categorySlug, roomId)] = roomId ? { ...product, roomId } : product;
          return { selectedProducts: next };
        }),
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
    }),
    {
      name: 'renovate-calculator',
      storage: createJSONStorage(() => localStorage),
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
      }),
    }
  )
);

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
});

const persistedSchema = z.object({
  homeState: homeStateEnum.nullable(),
  rooms: calculatorRequestSchema.shape.rooms.element.array(),
  selectedProducts: z.record(selectedProductSchema),
  selectedFurniture: z.record(z.array(selectedProductSchema)),
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  projectId: z.number().int().positive().nullable().optional(),
  calculated: z.boolean().optional(),
  excluded: z.array(z.union([z.string(), z.number()])).optional(),
  quantities: z.record(z.number()).optional(),
});

function migratePersisted(persisted: unknown, version: number): Persisted {
  if (version !== PERSIST_VERSION) return { ...initial };
  const parsed = persistedSchema.safeParse(persisted);
  if (!parsed.success) return { ...initial };
  return {
    ...initial,
    ...parsed.data,
    projectId: parsed.data.projectId ?? null,
    calculated: parsed.data.calculated ?? false,
    excluded: parsed.data.excluded ?? [],
    quantities: parsed.data.quantities ?? {},
    rooms: parsed.data.rooms as Room[],
    selectedProducts: parsed.data.selectedProducts as Record<string, SelectedProduct>,
    selectedFurniture: parsed.data.selectedFurniture as Record<string, SelectedProduct[]>,
  };
}
