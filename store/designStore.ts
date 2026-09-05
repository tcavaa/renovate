'use client';

/**
 * Design Studio state.
 *
 * Persisted to localStorage like the calculator store, so a visitor can upload a plan, wander
 * off, and come back to their room still furnished. The catalogue is deliberately *not*
 * persisted — it is refetched per session so prices are never stale.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { z } from 'zod';
import { floorPlanSchema, placedItemSchema, surfaceFinishSchema } from '@/lib/validations/design.schema';
import { defaultFinish, finishFromProduct } from '@/lib/design/surfaces';
import { applyFinishPicks, applyFurniturePicks, picksFromCalculator, type CalculatorPicks } from '@/lib/design/fromCalculator';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import { layoutPlan } from '@/lib/design/autoLayout';
import {
  DEFAULT_WALL_THICKNESS_M,
  deriveOpenings,
  polygonBounds,
  refreshRoom,
  toCounterClockwise,
  planFromCalculatorRooms,
} from '@/lib/design/planGeometry';
import { applySwap, matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import type {
  DesignMode,
  DesignScene,
  FloorPlan,
  PlacedItem,
  PlanRoom,
  StyleId,
  SurfaceFinish,
  Vec2,
} from '@/lib/design/types';

export type StudioStep = 1 | 2 | 3 | 4 | 5;

interface DesignState {
  mode: DesignMode;
  /** Set when the journey started in the calculator; the summary prices against it. */
  homeState: HomeState | null;
  /** What the user picked in the calculator, applied on top of every layout. */
  calculatorPicks: CalculatorPicks | null;
  styleId: StyleId;
  budgetGel: number | null;
  plan: FloorPlan | null;
  floorPlanUrl: string | null;
  items: PlacedItem[];
  finishes: SurfaceFinish[];
  /** Room the camera is focused on, or null for the whole flat. */
  focusRoomId: string | null;
  selectedItemId: string | null;
  step: StudioStep;
}

interface DesignActions {
  setMode: (mode: DesignMode) => void;
  setStyle: (styleId: StyleId, catalog: CatalogProduct[]) => void;
  setBudget: (budgetGel: number | null, catalog: CatalogProduct[]) => void;
  setPlan: (plan: FloorPlan, floorPlanUrl?: string | null) => void;
  updateRoom: (roomId: string, patch: Partial<PlanRoom>) => void;
  /** Rescales a room's outline to the given bounding size, keeping its shape and corner. */
  resizeRoom: (roomId: string, widthM: number, depthM: number) => void;
  /** Adds a plain rectangular room beside the flat — the manual fallback when parsing misses one. */
  addRoom: (name: string) => void;
  removeRoom: (roomId: string) => void;
  /** Runs the layout engine and fills every slot from the catalogue. */
  generate: (catalog: CatalogProduct[]) => void;
  /**
   * Continues a finished calculator into 3D: its rooms (the uploaded plan when there is one),
   * its home state, and its product and furniture picks. Lands on the style step.
   */
  startFromCalculator: (input: {
    rooms: Room[];
    homeState: HomeState;
    selectedProducts: Record<string, SelectedProduct>;
    selectedFurniture: Record<string, SelectedProduct[]>;
  }) => void;
  /** Gives rooms a floor or wall finish; null returns them to the style's default. */
  setFinish: (roomIds: string[], surface: 'floor' | 'wall', product: CatalogProduct | null) => void;
  swapProduct: (itemId: string, product: CatalogProduct) => void;
  /** Commits a drag. The room may change if the item was dragged into a neighbour. */
  placeItem: (itemId: string, position: Vec2, rotation: number, roomId?: string) => void;
  removeItem: (itemId: string) => void;
  setFocusRoom: (roomId: string | null) => void;
  selectItem: (itemId: string | null) => void;
  setStep: (step: StudioStep) => void;
  reset: () => void;
  scene: () => DesignScene;
}

/** Bump when the persisted shape changes — see the Persistence section at the bottom. */
const PERSIST_VERSION = 1;

const initial: DesignState = {
  mode: 'design_only',
  homeState: null,
  calculatorPicks: null,
  styleId: 'scandinavian',
  budgetGel: null,
  plan: null,
  floorPlanUrl: null,
  items: [],
  finishes: [],
  focusRoomId: null,
  selectedItemId: null,
  step: 1,
};

export const useDesignStore = create<DesignState & DesignActions>()(
  persist(
    (set, get) => ({
      ...initial,

      setMode: (mode) => set({ mode }),

      setStyle: (styleId, catalog) => {
        const { plan, items, budgetGel } = get();
        set({ styleId, finishes: defaultFinishes(plan, styleId) });
        if (items.length === 0 || catalog.length === 0) return;
        // Keep the layout, re-pick the products: switching style should redress the room,
        // not rearrange it.
        set({
          items: placeableOnly(
            matchProducts(
              items.map((i) => ({ ...i, pinned: false })),
              catalog,
              { styleId, budgetGel }
            )
          ),
        });
      },

      setBudget: (budgetGel, catalog) => {
        const { items, styleId } = get();
        set({ budgetGel });
        if (items.length === 0 || catalog.length === 0) return;
        set({ items: placeableOnly(matchProducts(items, catalog, { styleId, budgetGel })) });
      },

      setPlan: (plan, floorPlanUrl) =>
        set((s) => ({
          plan,
          floorPlanUrl: floorPlanUrl ?? s.floorPlanUrl,
          finishes: defaultFinishes(plan, s.styleId),
          // A new plan invalidates any furniture laid out against the old one.
          items: [],
          focusRoomId: null,
          selectedItemId: null,
        })),

      updateRoom: (roomId, patch) =>
        set((s) => {
          if (!s.plan) return s;
          return {
            plan: {
              ...s.plan,
              rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
            },
          };
        }),

      resizeRoom: (roomId, widthM, depthM) =>
        set((s) => {
          if (!s.plan) return s;
          const room = s.plan.rooms.find((r) => r.id === roomId);
          if (!room) return s;

          const bounds = polygonBounds(room.polygon);
          const scaleX = bounds.width > 0.01 ? widthM / bounds.width : 1;
          const scaleZ = bounds.depth > 0.01 ? depthM / bounds.depth : 1;

          // Scale about the room's top-left corner so it grows into free space rather than
          // drifting, and so an L-shaped room keeps its notch.
          const resized = refreshRoom({
            ...room,
            polygon: room.polygon.map((p) => ({
              x: bounds.minX + (p.x - bounds.minX) * scaleX,
              z: bounds.minZ + (p.z - bounds.minZ) * scaleZ,
            })),
          });

          const rooms = s.plan.rooms.map((r) => (r.id === roomId ? resized : r));
          deriveOpenings(rooms, s.plan.wallThicknessM);
          return {
            plan: { ...s.plan, rooms },
            // The old layout was measured against the old outline.
            items: s.items.filter((i) => i.roomId !== roomId),
          };
        }),

      addRoom: (name) =>
        set((s) => {
          const wallThicknessM = s.plan?.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;
          const existing = s.plan?.rooms ?? [];

          // Drop it just clear of everything else, so it never lands on top of a parsed room.
          const right = existing.length
            ? Math.max(...existing.flatMap((r) => r.polygon.map((p) => p.x))) + wallThicknessM + 0.4
            : 0;
          const top = existing.length
            ? Math.min(...existing.flatMap((r) => r.polygon.map((p) => p.z)))
            : 0;

          const polygon = toCounterClockwise([
            { x: right, z: top },
            { x: right + 4, z: top },
            { x: right + 4, z: top + 3 },
            { x: right, z: top + 3 },
          ]);

          const room = refreshRoom({
            id: `m${Date.now().toString(36)}`,
            type: 'bedroom',
            name,
            polygon,
            heightM: 2.8,
            areaM2: 0,
            perimeterM: 0,
            openings: [],
          });

          const rooms = [...existing, room];
          deriveOpenings(rooms, wallThicknessM);

          const allX = rooms.flatMap((r) => r.polygon.map((p) => p.x));
          const allZ = rooms.flatMap((r) => r.polygon.map((p) => p.z));

          return {
            plan: {
              rooms,
              metresPerPixel: s.plan?.metresPerPixel ?? null,
              bounds: {
                width: Math.max(...allX) - Math.min(...allX),
                depth: Math.max(...allZ) - Math.min(...allZ),
              },
              source: s.plan?.source ?? 'manual',
              imageUrl: s.plan?.imageUrl ?? null,
              wallThicknessM,
            },
            finishes: defaultFinishes(
              { ...(s.plan as FloorPlan), rooms, wallThicknessM },
              s.styleId
            ),
          };
        }),

      removeRoom: (roomId) =>
        set((s) => {
          if (!s.plan) return s;
          return {
            plan: { ...s.plan, rooms: s.plan.rooms.filter((r) => r.id !== roomId) },
            items: s.items.filter((i) => i.roomId !== roomId),
            finishes: s.finishes.filter((f) => f.roomId !== roomId),
            focusRoomId: s.focusRoomId === roomId ? null : s.focusRoomId,
          };
        }),

      generate: (catalog) => {
        const { plan, styleId, budgetGel, calculatorPicks } = get();
        if (!plan) return;
        const placed = layoutPlan(plan.rooms);
        // A slot no partner product can fill is dropped rather than shown as a stand-in.
        set((s) => {
          let items = placeableOnly(matchProducts(placed, catalog, { styleId, budgetGel }));
          // Re-laying out the furniture is not a reason to lose the tiles someone picked.
          let finishes = keepChosen(defaultFinishes(plan, styleId), s.finishes);
          if (calculatorPicks) {
            items = placeableOnly(applyFurniturePicks(items, plan, calculatorPicks, catalog));
            finishes = applyFinishPicks(finishes, plan, calculatorPicks, catalog);
          }
          return { items, finishes, selectedItemId: null };
        });
      },

      startFromCalculator: ({ rooms, homeState, selectedProducts, selectedFurniture }) =>
        set((s) => {
          // A plan uploaded in the calculator keeps its real walls; rooms typed by hand become
          // a row of rectangles. Either way the calculator's types, names and heights win.
          const ids = new Set(rooms.map((r) => r.id));
          const current = s.plan;
          const reusable =
            !!current &&
            current.source !== 'calculator' &&
            current.rooms.length === rooms.length &&
            current.rooms.every((r) => ids.has(r.id));
          let plan: FloorPlan;
          if (reusable && current) {
            const synced = current.rooms.map((pr) => {
              const cr = rooms.find((r) => r.id === pr.id)!;
              return { ...pr, type: cr.type, name: cr.nameKa, heightM: cr.height, openings: [...pr.openings] };
            });
            deriveOpenings(synced, current.wallThicknessM);
            plan = { ...current, rooms: synced };
          } else {
            plan = planFromCalculatorRooms(rooms);
          }
          return {
            plan,
            mode: 'full',
            homeState,
            calculatorPicks: picksFromCalculator(selectedProducts, selectedFurniture),
            items: [],
            finishes: defaultFinishes(plan, s.styleId),
            focusRoomId: null,
            selectedItemId: null,
            step: 3,
          };
        }),

      setFinish: (roomIds, surface, product) =>
        set((s) => {
          if (!s.plan) return s;
          const rooms = s.plan.rooms.filter((r) => roomIds.includes(r.id));
          const next = s.finishes.filter((f) => !(f.surface === surface && roomIds.includes(f.roomId)));
          for (const room of rooms) {
            next.push(product ? finishFromProduct(room, surface, product) : defaultFinish(room, surface, s.styleId));
          }
          return { finishes: next };
        }),

      swapProduct: (itemId, product) =>
        set((s) => ({ items: applySwap(s.items, itemId, product) })),

      placeItem: (itemId, position, rotation, roomId) =>
        set((s) => ({
          items: s.items.map((item) =>
            item.id === itemId
              ? { ...item, position, rotation, roomId: roomId ?? item.roomId }
              : item
          ),
        })),

      removeItem: (itemId) =>
        set((s) => ({
          items: s.items.filter((i) => i.id !== itemId),
          selectedItemId: s.selectedItemId === itemId ? null : s.selectedItemId,
        })),

      setFocusRoom: (focusRoomId) => set({ focusRoomId }),
      selectItem: (selectedItemId) => set({ selectedItemId }),
      setStep: (step) => set({ step }),
      reset: () => set({ ...initial }),

      scene: () => {
        const { styleId, mode, budgetGel, items, finishes } = get();
        return { styleId, mode, budgetGel, items, finishes };
      },
    }),
    {
      name: 'renovate-design',
      storage: createJSONStorage(() => localStorage),
      version: PERSIST_VERSION,
      migrate: migratePersisted,
      // `scene` is a getter, not state; persisting the catalogue would go stale.
      partialize: (s) => ({
        mode: s.mode,
        homeState: s.homeState,
        calculatorPicks: s.calculatorPicks,
        styleId: s.styleId,
        budgetGel: s.budgetGel,
        plan: s.plan,
        floorPlanUrl: s.floorPlanUrl,
        items: s.items,
        finishes: s.finishes,
        step: s.step,
      }),
    }
  )
);

/** Keeps only the items that ended up with a real partner model behind them. */
function placeableOnly(items: PlacedItem[]): PlacedItem[] {
  return items.filter((item) => !!item.product?.model3dUrl);
}

/** Default floor/wall/ceiling finishes from the style — tiles in the wet rooms. */
function defaultFinishes(plan: FloorPlan | null, styleId: StyleId): SurfaceFinish[] {
  if (!plan) return [];
  const surfaces: Array<SurfaceFinish['surface']> = ['floor', 'wall', 'ceiling'];
  return plan.rooms.flatMap((room) => surfaces.map((surface) => defaultFinish(room, surface, styleId)));
}

/** Defaults, except where a room already has a finish somebody chose. */
function keepChosen(defaults: SurfaceFinish[], current: SurfaceFinish[]): SurfaceFinish[] {
  return defaults.map(
    (d) => current.find((c) => c.roomId === d.roomId && c.surface === d.surface && c.product) ?? d
  );
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Bump when the persisted shape changes. Anything stored under an older version, or
 * anything that fails validation, is dropped rather than rehydrated: a stale plan from a
 * previous release would otherwise reach the layout engine and the viewer with fields
 * missing and fail somewhere far from here.
 */
const persistedSchema = z.object({
  mode: z.enum(['full', 'design_only']),
  homeState: z.enum(['black_frame', 'white_frame', 'green_frame']).nullable(),
  calculatorPicks: z
    .object({
      furniture: z.array(z.object({ roomId: z.string(), productId: z.number().int() })),
      productIds: z.array(z.number().int()),
    })
    .nullable(),
  styleId: z.enum(['modern', 'scandinavian', 'industrial', 'vintage']),
  budgetGel: z.number().nullable(),
  plan: floorPlanSchema.nullable(),
  floorPlanUrl: z.string().nullable(),
  items: z.array(placedItemSchema),
  finishes: z.array(surfaceFinishSchema),
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

function migratePersisted(persisted: unknown, version: number): DesignState {
  if (version !== PERSIST_VERSION) return { ...initial };
  const parsed = persistedSchema.safeParse(persisted);
  if (!parsed.success) return { ...initial };
  return {
    ...initial,
    ...parsed.data,
    plan: parsed.data.plan as FloorPlan | null,
    items: parsed.data.items as PlacedItem[],
    finishes: parsed.data.finishes as SurfaceFinish[],
  };
}
