'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { z } from 'zod';
import { calculatorRequestSchema, homeStateEnum } from '@/lib/validations/room.schema';
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
  /** Opens a saved project's rooms and picks for (re)calculation — the "calculate costs" button. */
  openSavedProject: (input: {
    projectId: number;
    rooms: Room[];
    homeState: HomeState | null;
    selectedProducts: Record<string, SelectedProduct>;
    selectedFurniture: Record<string, SelectedProduct[]>;
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
  removeProduct: (key: string) => void;
  addFurniture: (roomId: string, product: SelectedProduct) => void;
  removeFurniture: (roomId: string, productId: number) => void;
  reset: () => void;
}

/** Bump when the persisted shape changes — see the Persistence section at the bottom. */
const PERSIST_VERSION = 1;

const initial: CalculatorState & { projectId: number | null } = {
  homeState: null,
  rooms: [],
  selectedProducts: {},
  selectedFurniture: {},
  step: 1,
  projectId: null,
};

export const useCalculatorStore = create<CalculatorStore>()(
  persist(
    (set) => ({
      ...initial,
      setProjectId: (projectId) => set({ projectId }),
      openSavedProject: ({ projectId, rooms, homeState, selectedProducts, selectedFurniture }) =>
        set({ projectId, rooms, homeState, selectedProducts, selectedFurniture, step: 1 }),
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
      replaceRooms: (rooms) => set({ rooms, selectedProducts: {}, selectedFurniture: {}, projectId: null }),
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
});

const persistedSchema = z.object({
  homeState: homeStateEnum.nullable(),
  rooms: calculatorRequestSchema.shape.rooms.element.array(),
  selectedProducts: z.record(selectedProductSchema),
  selectedFurniture: z.record(z.array(selectedProductSchema)),
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  projectId: z.number().int().positive().nullable().optional(),
});

function migratePersisted(persisted: unknown, version: number): CalculatorState & { projectId: number | null } {
  if (version !== PERSIST_VERSION) return { ...initial };
  const parsed = persistedSchema.safeParse(persisted);
  if (!parsed.success) return { ...initial };
  return {
    ...initial,
    ...parsed.data,
    projectId: parsed.data.projectId ?? null,
    rooms: parsed.data.rooms as Room[],
    selectedProducts: parsed.data.selectedProducts as Record<string, SelectedProduct>,
    selectedFurniture: parsed.data.selectedFurniture as Record<string, SelectedProduct[]>,
  };
}
