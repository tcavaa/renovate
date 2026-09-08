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
import { placeAdditional } from '@/lib/design/autoLayout';
import { getArchetype } from '@/lib/design/catalog';
import { addOpening as addOpeningTo, moveOpening as moveOpeningIn, removeOpening as removeOpeningFrom, setOpeningWall as setOpeningWallIn, updateOpening as updateOpeningIn } from '@/lib/design/openings';
import type {
  DesignMode,
  DesignScene,
  FloorPlan,
  Opening,
  OpeningKind,
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
  /** The saved project this design belongs to, so saving writes into the same row as the calculation. */
  projectId: number | null;
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
  /** An item just added from the catalogue, riding on the pointer until it is clicked down. */
  carryingItemId: string | null;
  /** Calculator picks arrived for a design that already exists; the studio applies them on entry. */
  pendingPicks: boolean;
  step: StudioStep;
}

interface DesignActions {
  setMode: (mode: DesignMode) => void;
  setHomeState: (homeState: HomeState) => void;
  setProjectId: (id: number | null) => void;
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
    /** The saved calculator project, so the design is written into the same row. */
    projectId?: number | null;
  }) => 'studio' | 'style';
  /** Puts pending calculator picks into the existing design without re-laying it out. */
  applyPendingPicks: (catalog: CatalogProduct[]) => void;
  /** Reopens a saved design project in the studio exactly as it was saved. */
  openSaved: (input: { projectId?: number | null; plan: FloorPlan; scene: DesignScene; floorPlanUrl: string | null; homeState: HomeState | null }) => void;
  /** Gives rooms a floor or wall finish; null returns them to the style's default. */
  setFinish: (roomIds: string[], surface: 'floor' | 'wall', product: CatalogProduct | null) => void;
  swapProduct: (itemId: string, product: CatalogProduct) => void;
  /**
   * Puts one more product into a room: the layout engine finds it a spot among what is
   * already there. Returns the new item's id, or null when the room has no room for it.
   */
  addItem: (product: CatalogProduct, roomId: string) => string | null;
  /**
   * Adds a product and hands it to the pointer: the viewer moves it with the mouse, R turns
   * it, a click sets it down where it fits, Escape (`cancelCarry`) removes it again.
   */
  beginAdd: (product: CatalogProduct, roomId: string) => string | null;
  finishCarry: () => void;
  cancelCarry: () => void;
  addOpening: (roomId: string, kind: OpeningKind, wallIndex?: number | null) => string | null;
  moveOpening: (roomId: string, openingId: string, t: number) => void;
  updateOpening: (roomId: string, openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'kind'>>) => void;
  setOpeningWall: (roomId: string, openingId: string, wallIndex: number) => void;
  removeOpening: (roomId: string, openingId: string) => void;
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
  projectId: null,
  calculatorPicks: null,
  styleId: 'scandinavian',
  budgetGel: null,
  plan: null,
  floorPlanUrl: null,
  items: [],
  finishes: [],
  focusRoomId: null,
  selectedItemId: null,
  carryingItemId: null,
  pendingPicks: false,
  step: 1,
};

export const useDesignStore = create<DesignState & DesignActions>()(
  persist(
    (set, get) => ({
      ...initial,

      // Renovation needs a starting state to price from; white frame is the common case.
      setMode: (mode) => set((s) => ({ mode, homeState: mode === 'full' ? s.homeState ?? 'white_frame' : s.homeState })),
      setHomeState: (homeState) => set({ homeState }),
      setProjectId: (projectId) => set({ projectId }),

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
          // A new plan is a new flat: the furniture laid out against the old one and the
          // calculator's picks for it are gone with it.
          items: [],
          calculatorPicks: null,
          focusRoomId: null,
          selectedItemId: null,
          // …and a new project on the server: the next save gets its own row.
          projectId: null,
        })),

      openSaved: ({ projectId = null, plan, scene, floorPlanUrl, homeState }) =>
        set({
          projectId,
          pendingPicks: false,
          plan,
          floorPlanUrl,
          homeState,
          mode: scene.mode,
          styleId: scene.styleId,
          budgetGel: scene.budgetGel,
          items: scene.items,
          finishes: scene.finishes,
          calculatorPicks: null,
          focusRoomId: null,
          selectedItemId: null,
          step: 4,
        }),

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

      startFromCalculator: ({ rooms, homeState, selectedProducts, selectedFurniture, projectId = null }) => {
        let landing: 'studio' | 'style' = 'style';
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
          const calculatorPicks = picksFromCalculator(selectedProducts, selectedFurniture);
          // The same project already has a design: keep it, and let the studio put the
          // calculator's picks into it rather than laying the flat out again.
          const keepDesign = projectId != null && s.projectId === projectId && reusable && s.items.length > 0;
          if (keepDesign) {
            landing = 'studio';
            return { plan, projectId, mode: 'full', homeState, calculatorPicks, pendingPicks: true, focusRoomId: null, selectedItemId: null, step: 4 };
          }
          return {
            plan,
            projectId,
            mode: 'full',
            homeState,
            calculatorPicks,
            pendingPicks: false,
            items: [],
            finishes: defaultFinishes(plan, s.styleId),
            focusRoomId: null,
            selectedItemId: null,
            step: 3,
          };
        });
        return landing;
      },

      applyPendingPicks: (catalog) => {
        const { plan, items, finishes, calculatorPicks, pendingPicks } = get();
        if (!pendingPicks) return;
        if (!plan || !calculatorPicks) {
          set({ pendingPicks: false });
          return;
        }
        set({
          items: placeableOnly(applyFurniturePicks(items, plan, calculatorPicks, catalog)),
          finishes: applyFinishPicks(finishes, plan, calculatorPicks, catalog),
          pendingPicks: false,
        });
      },

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

      addItem: (product, roomId) => {
        const { plan, items } = get();
        const room = plan?.rooms.find((r) => r.id === roomId);
        const kind = product.model3dKind;
        if (!plan || !room || !kind || !product.model3dUrl) return null;
        const size =
          product.widthCm && product.depthCm && product.heightCm
            ? { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 }
            : undefined;
        const extra = placeAdditional(room, kind, items, size);
        if (!extra) return null;
        const id = `${extra.id}-${Date.now().toString(36)}`;
        const placed = applySwap([...items, { ...extra, id }], id, product);
        set({ items: placed, selectedItemId: id, focusRoomId: get().focusRoomId ?? null });
        return id;
      },

      beginAdd: (product, roomId) => {
        const { plan, items } = get();
        const room = plan?.rooms.find((r) => r.id === roomId);
        const kind = product.model3dKind;
        const archetype = kind ? getArchetype(kind) : undefined;
        if (!plan || !room || !kind || !archetype || !product.model3dUrl) return null;
        const size =
          product.widthCm && product.depthCm && product.heightCm
            ? { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 }
            : archetype.size;
        // A free spot when there is one, so a click without moving already lands; otherwise
        // the middle of the room, shown red until the pointer carries it somewhere it fits.
        const found = placeAdditional(room, kind, items, size);
        const centre = {
          x: room.polygon.reduce((sum, pt) => sum + pt.x, 0) / room.polygon.length,
          z: room.polygon.reduce((sum, pt) => sum + pt.z, 0) / room.polygon.length,
        };
        const index = items.filter((i) => i.roomId === room.id && i.kind === kind).length;
        const extra: PlacedItem = found ?? {
          id: `${room.id}-${kind}-extra-${index}`,
          roomId: room.id,
          slot: archetype.slot,
          kind,
          position: centre,
          rotation: 0,
          elevationM: archetype.placement.type === 'ceiling' ? Math.max(0, room.heightM - size.height) : 0,
          size,
          product: null,
        };
        const id = `${extra.id}-${Date.now().toString(36)}`;
        const placed = applySwap([...items, { ...extra, id }], id, product);
        set({ items: placed, selectedItemId: id, carryingItemId: id });
        return id;
      },

      finishCarry: () => set({ carryingItemId: null }),

      cancelCarry: () => {
        const { carryingItemId, items, selectedItemId } = get();
        if (!carryingItemId) return;
        set({
          items: items.filter((i) => i.id !== carryingItemId),
          selectedItemId: selectedItemId === carryingItemId ? null : selectedItemId,
          carryingItemId: null,
        });
      },

      addOpening: (roomId, kind, wallIndex = null) => {
        const { plan } = get();
        if (!plan) return null;
        const result = addOpeningTo(plan.rooms, roomId, kind, wallIndex, plan.wallThicknessM);
        if (!result.openingId) return null;
        set({ plan: { ...plan, rooms: result.rooms } });
        return result.openingId;
      },
      moveOpening: (roomId, openingId, t) =>
        set((s) => (s.plan ? { plan: { ...s.plan, rooms: moveOpeningIn(s.plan.rooms, roomId, openingId, t) } } : s)),
      updateOpening: (roomId, openingId, patch) =>
        set((s) => (s.plan ? { plan: { ...s.plan, rooms: updateOpeningIn(s.plan.rooms, roomId, openingId, patch) } } : s)),
      setOpeningWall: (roomId, openingId, wallIndex) =>
        set((s) => (s.plan ? { plan: { ...s.plan, rooms: setOpeningWallIn(s.plan.rooms, roomId, openingId, wallIndex, s.plan.wallThicknessM) } } : s)),
      removeOpening: (roomId, openingId) =>
        set((s) => (s.plan ? { plan: { ...s.plan, rooms: removeOpeningFrom(s.plan.rooms, roomId, openingId) } } : s)),

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
        projectId: s.projectId,
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
  projectId: z.number().int().positive().nullable().optional(),
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
    projectId: parsed.data.projectId ?? null,
    plan: parsed.data.plan as FloorPlan | null,
    items: parsed.data.items as PlacedItem[],
    finishes: parsed.data.finishes as SurfaceFinish[],
  };
}
