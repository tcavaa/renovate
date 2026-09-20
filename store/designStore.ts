'use client';

/**
 * Design Studio state.
 *
 * Persisted to localStorage like the calculator store, so a visitor can upload a plan, wander
 * off, and come back to their room still furnished. The catalogue is deliberately *not*
 * persisted — it is refetched per session so prices are never stale.
 *
 * Version 2 of the store carries the whole flat: walls (rooms are derived from them),
 * columns and beams, the technical points, the electrical layer, finishes on single walls
 * and floor zones, the kept versions of the flat, and an undo/redo history of everything
 * that changes the plan or the scene. Every mutating action goes through `commit`, which
 * records the present before applying the change, so Ctrl+Z always has somewhere to go.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { z } from 'zod';
import { designVersionSchema, electricalPointSchema, floorPlanSchema, placedItemSchema, styleProfileSchema, surfaceFinishSchema, MAX_VERSIONS } from '@/lib/validations/design.schema';
import { defaultFinish, finishFromProduct } from '@/lib/design/surfaces';
import { applyFinishPicks, applyFurniturePicks, picksFromCalculator, type CalculatorPicks } from '@/lib/design/fromCalculator';
import type { HomeState, Room, RoomType, SelectedProduct } from '@/lib/calculator/types';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { layoutPlan } from '@/lib/design/autoLayout';
import {
  DEFAULT_WALL_THICKNESS_M,
  deriveOpenings,
  isAutoRoomName,
  nextRoomName,
  pointInPolygon,
  polygonBounds,
  polygonCentroid,
  refreshRoom,
  toCounterClockwise,
  planFromCalculatorRooms,
} from '@/lib/design/planGeometry';
import { applySwap, matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { placeAdditional } from '@/lib/design/autoLayout';
import { getArchetype } from '@/lib/design/catalog';
import { addOpening as addOpeningTo, mirrorHinge, mirrorSwing, moveOpening as moveOpeningIn, moveOpeningToWall as moveOpeningToWallIn, removeOpening as removeOpeningFrom, setOpeningProduct as setOpeningProductIn, setOpeningWall as setOpeningWallIn, twinOf, updateOpening as updateOpeningIn, withOpeningProducts, type WallTarget } from '@/lib/design/openings';
import {
  addWalls,
  columnFootprints,
  ensureWalls,
  moveNode as moveWallNodeIn,
  offsetWall as offsetWallIn,
  rebuildRooms,
  moveRooms as moveRoomsIn,
  removeWall as removeWallIn,
  resizeWall as resizeWallIn,
  updateWall as updateWallIn,
  wallsForRectangle,
  withBounds,
} from '@/lib/design/walls';
import { fittingClashes, fixtureCandidates, placeElectrical, reprojectElectrical, slideAlongWall, suggestElectrical, withFixtureProduct, withFixtureProducts } from '@/lib/design/electrical';
import { ELECTRICAL_KINDS, fixtureQuantity as fixtureQuantityOf } from '@/lib/design/electrical';
import { technicalAnchors, technicalElevation, TECHNICAL_KINDS } from '@/lib/design/technical';
import { suggestTechnical as suggestTechnicalIn } from '@/lib/design/autoTechnical';
import { suggestRadiators, withRadiatorProduct, withRadiatorProducts } from '@/lib/design/radiators';
import { emptyHistory, pushHistory, redoHistory, undoHistory, type History } from '@/lib/design/history';
import { isPlacementValid } from '@/lib/design/manipulate';
import { isBaseFinish } from '@/lib/design/zones';
import { cellPolygon, paintCell, paintPatch, paintSpan, patchInRange, type PaintTarget } from '@/lib/design/paint';
import { defaultTrim, isTrimSurface, trimFromProduct } from '@/lib/design/trims';
import { roomEdges } from '@/lib/design/planGeometry';
import type {
  Beam,
  Column,
  DesignMode,
  DesignScene,
  DesignVersion,
  ElectricalKind,
  ElectricalPoint,
  FinishZone,
  FloorPlan,
  Opening,
  OpeningKind,
  PlacedItem,
  PlanRoom,
  StyleId,
  StyleProfile,
  SurfaceFinish,
  TechnicalKind,
  TechnicalPoint,
  Vec2,
  Wall,
} from '@/lib/design/types';

/**
 * The eight steps of the journey: upload · draw the existing house · technical setup ·
 * style test · 3D design · materials & finishes · budget · find the team. Steps 5 and 6
 * are the same studio page with a different tool in hand.
 */
export type StudioStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** What the undo history remembers: everything that draws or costs. */
export interface DesignSnapshot {
  plan: FloorPlan | null;
  items: PlacedItem[];
  finishes: SurfaceFinish[];
  electrical: ElectricalPoint[];
}

/** Something picked in the plan or the 3D view that is not a piece of furniture. */
export type ElementSelection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string; roomId: string }
  | { kind: 'column'; id: string }
  | { kind: 'beam'; id: string }
  | { kind: 'technical'; id: string }
  | { kind: 'electrical'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'zone'; id: string; roomId: string }
  | null;

interface DesignState {
  mode: DesignMode;
  /**
   * Whether the person has actually chosen a mode. `mode` always holds a value because
   * everything downstream prices against it, but the first step must not look pre-answered:
   * the choice between "design only" and "renovation too" is theirs to make.
   */
  modeChosen: boolean;
  /** Set when the journey started in the calculator; the summary prices against it. */
  homeState: HomeState | null;
  /** The saved project this design belongs to, so saving writes into the same row as the calculation. */
  projectId: number | null;
  /** What the user picked in the calculator, applied on top of every layout. */
  calculatorPicks: CalculatorPicks | null;
  styleId: StyleId;
  /** The five answers of the style test, when it was taken. */
  styleProfile: StyleProfile | null;
  /** Products the person is not ordering — ticked off on the budget page. */
  excluded: number[];
  budgetGel: number | null;
  plan: FloorPlan | null;
  floorPlanUrl: string | null;
  items: PlacedItem[];
  finishes: SurfaceFinish[];
  /** Sockets, switches and lights. */
  electrical: ElectricalPoint[];
  /** The kept versions of the flat, oldest first; the first is the existing house. */
  versions: DesignVersion[];
  /** Room the camera is focused on, or null for the whole flat. */
  focusRoomId: string | null;
  /**
   * Rooms picked out on the 2D board — one click, or a rubber band across several, the way
   * a desktop selects folders. They move together and detach from what stays behind. A
   * fact about this session, so not persisted.
   */
  selectedRoomIds: string[];
  selectedItemId: string | null;
  selectedElement: ElementSelection;
  /** An item just added from the catalogue, riding on the pointer until it is clicked down. */
  carryingItemId: string | null;
  /** Walls, doors and windows are locked until the person unlocks them in the toolbar. */
  structureLocked: boolean;
  /** A piece copied with Ctrl+C, waiting for Ctrl+V. */
  clipboard: PlacedItem | null;
  /** Calculator picks arrived for a design that already exists; the studio applies them on entry. */
  pendingPicks: boolean;
  /**
   * The flat has been laid out: the journey is past the point of no return.
   *
   * Everything from the studio on stays editable, but the steps *before* it are closed —
   * the plan, the technical setup and the style all fed the layout, and going back to change
   * one of them would mean generating again over a flat somebody has since furnished by
   * hand. Starting over is a deliberate act (`resetFlow`), not a click on the step strip.
   */
  generated: boolean;
  step: StudioStep;
  /** What the autosave is doing right now. Not persisted. */
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  /** Undo/redo. Not persisted. */
  history: History<DesignSnapshot>;
  /**
   * Counts the times a *different* plan was taken in (upload, saved project, calculator);
   * edits to the same plan leave it alone. The 2D board refits its view when this changes
   * and nowhere else, so drawing a wall never recentres the drawing. Not persisted.
   */
  planSerial: number;
}

interface DesignActions {
  setSaveState: (state: DesignState['saveState']) => void;
  setMode: (mode: DesignMode) => void;
  setHomeState: (homeState: HomeState) => void;
  setProjectId: (id: number | null) => void;
  setStyle: (styleId: StyleId, catalog: CatalogProduct[]) => void;
  setStyleProfile: (profile: StyleProfile | null) => void;
  /** Puts a product in or out of the order; the budget and the checkout follow. */
  toggleExcluded: (productId: number) => void;
  /** Everything in, or a whole section out, in one go. */
  setExcluded: (productIds: number[]) => void;
  setBudget: (budgetGel: number | null, catalog: CatalogProduct[]) => void;
  /** A new plan — a new flat, a new project. Walls are derived when the plan has none. */
  setPlan: (plan: FloorPlan, floorPlanUrl?: string | null) => void;
  /** The same flat, edited: rooms that vanished lose their furniture, everything else stays. */
  updatePlan: (plan: FloorPlan) => void;
  setPlanDefaults: (patch: Partial<Pick<FloorPlan, 'wallThicknessM' | 'wallHeightM'>>) => void;
  updateRoom: (roomId: string, patch: Partial<PlanRoom>) => void;
  /** Rescales a room's outline to the given bounding size, keeping its shape and corner. */
  resizeRoom: (roomId: string, widthM: number, depthM: number) => void;
  /** Adds a plain rectangular room beside the flat — the manual fallback when parsing misses one. */
  addRoom: (name: string) => void;
  /** Four walls around a drawn rectangle; the room inside is exactly the rectangle. Returns its id. */
  addRectangleRoom: (rect: { x: number; z: number; width: number; depth: number }, type?: RoomType, name?: string) => string | null;
  removeRoom: (roomId: string) => void;
  /** The rooms picked out on the board (a click, or a rubber band across several). */
  selectRooms: (roomIds: string[]) => void;
  /**
   * Moves those rooms bodily, with their walls, furniture, fittings, technical points and
   * painted zones. A wall shared with a room staying behind is split, so the two come apart.
   */
  moveRooms: (roomIds: string[], delta: Vec2) => void;
  // --- walls, columns, beams ---
  setWalls: (walls: Wall[]) => void;
  addWall: (wall: Omit<Wall, 'id' | 'origin'> & { origin?: Wall['origin'] }) => string;
  offsetWall: (wallId: string, distance: number) => void;
  moveWallNode: (from: Vec2, to: Vec2) => void;
  updateWall: (wallId: string, patch: Partial<Pick<Wall, 'thicknessM' | 'heightM' | 'material' | 'locked'>>) => void;
  /** Stretches a wall to a typed length, its far end (and whatever meets it) following. */
  resizeWall: (wallId: string, lengthM: number) => void;
  removeWall: (wallId: string) => void;
  addColumn: (position: Vec2, size?: Partial<Pick<Column, 'widthM' | 'depthM' | 'heightM' | 'material'>>) => string;
  updateColumn: (id: string, patch: Partial<Omit<Column, 'id'>>) => void;
  removeColumn: (id: string) => void;
  addBeam: (a: Vec2, b: Vec2, size?: Partial<Pick<Beam, 'widthM' | 'depthM' | 'elevationM' | 'material'>>) => string;
  updateBeam: (id: string, patch: Partial<Omit<Beam, 'id'>>) => void;
  removeBeam: (id: string) => void;
  // --- technical ---
  addTechnicalPoint: (kind: TechnicalKind, position: Vec2, roomId?: string | null) => string;
  updateTechnicalPoint: (id: string, patch: Partial<Omit<TechnicalPoint, 'id'>>) => void;
  removeTechnicalPoint: (id: string) => void;
  /** The real product a radiator is (null: back to the estimate). */
  setRadiatorProduct: (id: string, product: CatalogProduct | null) => void;
  /** A radiator under every window of the heated rooms that have none; with the catalogue each is a product at once. Returns how many were hung. */
  suggestRadiators: (catalog?: CatalogProduct[]) => number;
  /** Gives every radiator without a product the catalogue's best, and re-counts the sections of the rest — no history entry. */
  ensureRadiatorProducts: (catalog: CatalogProduct[]) => void;
  /**
   * Places the technical points the plan implies — water, waste, drains, gas, the panel,
   * the extractors, the air conditioners, one boiler — and returns how many went in.
   */
  suggestTechnical: () => number;
  setWorks: (works: string[]) => void;
  /** What the flat already has, so the budget leaves it out (`lib/design/existing`). */
  setExisting: (keys: string[]) => void;
  // --- electrical ---
  /** Sockets, switches and lights from the furniture; with the catalogue, each becomes a product. */
  suggestElectrical: (catalog?: CatalogProduct[]) => void;
  addElectricalPoint: (kind: ElectricalKind, position: Vec2, roomId: string, catalog?: CatalogProduct[]) => string | null;
  updateElectricalPoint: (id: string, patch: Partial<Omit<ElectricalPoint, 'id'>>) => void;
  /** Another kind of fitting: the usual height for it, and a product of that kind when the catalogue has one. */
  changeElectricalKind: (id: string, kind: ElectricalKind, catalog?: CatalogProduct[]) => void;
  /** The real product this fitting is (null: back to the estimate). */
  setElectricalProduct: (id: string, product: CatalogProduct | null) => void;
  moveElectricalPoint: (id: string, position: Vec2) => void;
  /** Slides a wall-mounted point along its wall to `t` (0..1 of the edge); the height stays. */
  slideElectricalPoint: (id: string, t: number) => void;
  removeElectricalPoint: (id: string) => void;
  clearElectrical: () => void;
  // --- furniture ---
  /** Runs the layout engine and fills every slot from the catalogue. */
  generate: (catalog: CatalogProduct[]) => void;
  /**
   * Empties the flat and leaves the flat: every piece of furniture, every fitting and every
   * chosen finish goes, the walls, doors, windows and technical points stay. The starting
   * point for designing a home from nothing rather than editing what the engine proposed.
   */
  clearDesign: () => void;
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
    /** The calculator's own drawing, which is the one the person has just been editing. */
    plan?: FloorPlan | null;
    floorPlanUrl?: string | null;
  }) => 'studio' | 'style';
  /** Puts pending calculator picks into the existing design without re-laying it out. */
  applyPendingPicks: (catalog: CatalogProduct[]) => void;
  /** Reopens a saved design project in the studio exactly as it was saved. */
  openSaved: (input: { projectId?: number | null; plan: FloorPlan; scene: DesignScene; floorPlanUrl: string | null; homeState: HomeState | null; versions?: DesignVersion[] }) => void;
  /** Gives rooms a floor or wall finish, a skirting board or a cornice; null returns them to the style's default. */
  setFinish: (roomIds: string[], surface: 'floor' | 'wall' | 'skirting' | 'cornice', product: CatalogProduct | null) => void;
  /** Paints one floor tile or one strip of one wall (`lib/design/paint`); null is the eraser. */
  paintSurface: (target: PaintTarget, product: CatalogProduct | null) => void;
  /** Takes everything painted on part of a surface off again — single walls, strips, zones, tiles — so the room's base shows. */
  clearPartialFinishes: (roomId: string, surface: 'floor' | 'wall') => void;
  /** One wall of a room; null removes the wall's own finish so the room's base shows again. */
  setWallFinish: (roomId: string, wallIndex: number, product: CatalogProduct | null) => void;
  /** A patch of a room's floor with its own finish (or none yet, to be picked). Returns the zone id. */
  addFinishZone: (roomId: string, zone: FinishZone, product: CatalogProduct | null) => string;
  updateFinishZone: (roomId: string, zoneId: string, patch: { zone?: FinishZone; product?: CatalogProduct | null }) => void;
  removeFinishZone: (roomId: string, zoneId: string) => void;
  swapProduct: (itemId: string, product: CatalogProduct) => void;
  /**
   * Puts one more product into a room: the layout engine finds it a spot among what is
   * already there. Returns the new item's id, or null when the room has no room for it.
   */
  addItem: (product: CatalogProduct, roomId: string) => string | null;
  /**
   * Adds a product and hands it to the pointer: the viewer moves it with the mouse, R turns
   * it, a click sets it down where it fits, Escape (`cancelCarry`) removes it again. With no
   * room (the whole flat) it starts in the first room that has space, largest first.
   */
  beginAdd: (product: CatalogProduct, roomId: string | null) => string | null;
  finishCarry: () => void;
  cancelCarry: () => void;
  /** With the catalogue, the new door or window is the best product of its kind at once. */
  addOpening: (roomId: string, kind: OpeningKind, wallIndex?: number | null, catalog?: CatalogProduct[]) => string | null;
  /** A door or window dragged in from the palette onto a wall. Returns the new id, or null when refused. */
  dropOpening: (kind: OpeningKind, target: WallTarget, catalog?: CatalogProduct[]) => string | null;
  moveOpening: (roomId: string, openingId: string, t: number) => void;
  /** Puts an opening down on any wall of any room. Returns its id afterwards (new when it changed wall), or null when refused. */
  moveOpeningToWall: (roomId: string, openingId: string, target: WallTarget) => string | null;
  /** A change of kind takes a product of the new kind from the catalogue, when given. */
  updateOpening: (roomId: string, openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'kind' | 'material' | 'hinge' | 'swing' | 'openAngleDeg' | 'locked'>>, catalog?: CatalogProduct[]) => void;
  /** The real product this door or window is (null: back to the estimate); the twin half follows. */
  setOpeningProduct: (roomId: string, openingId: string, product: CatalogProduct | null) => void;
  /** Gives every door and window without a product the catalogue's best one — no history entry; the studio calls it once the catalogue is in. */
  ensureOpeningProducts: (catalog: CatalogProduct[]) => void;
  setOpeningWall: (roomId: string, openingId: string, wallIndex: number) => void;
  removeOpening: (roomId: string, openingId: string) => void;
  /** Commits a drag. The room may change if the item was dragged into a neighbour. */
  placeItem: (itemId: string, position: Vec2, rotation: number, roomId?: string) => void;
  removeItem: (itemId: string) => void;
  /** Flips a piece across its own facing axis. */
  mirrorItem: (itemId: string) => void;
  lockItem: (itemId: string, locked: boolean) => void;
  /** A copy beside the original, where it fits. Returns the new id. */
  duplicateItem: (itemId: string) => string | null;
  copyItem: (itemId: string) => void;
  /** Pastes the clipboard into the focused room (or the copy's own). Returns the new id. */
  pasteItem: (roomId?: string | null) => string | null;
  setFocusRoom: (roomId: string | null) => void;
  selectItem: (itemId: string | null) => void;
  selectElement: (selection: ElementSelection) => void;
  setStructureLocked: (locked: boolean) => void;
  // --- history and versions ---
  undo: () => void;
  redo: () => void;
  /**
   * The studio's baseline, kept once per project: version 01 is the flat as the studio
   * first found it, furniture and all, and the undo history starts from there.
   */
  ensureExistingVersion: (name: string) => void;
  saveVersion: (name: string, kind?: DesignVersion['kind']) => string;
  /** Goes back to a kept version; the present is kept as a version first so nothing is lost. */
  restoreVersion: (versionId: string, keepCurrentAs: string) => void;
  renameVersion: (versionId: string, name: string) => void;
  deleteVersion: (versionId: string) => void;
  setStep: (step: StudioStep) => void;
  reset: () => void;
  scene: () => DesignScene;
}

/** Bump when the persisted shape changes — see the Persistence section at the bottom. */
const PERSIST_VERSION = 2;

const initial: DesignState = {
  mode: 'design_only',
  modeChosen: false,
  homeState: null,
  projectId: null,
  calculatorPicks: null,
  styleId: 'scandinavian',
  styleProfile: null,
  excluded: [],
  budgetGel: null,
  plan: null,
  floorPlanUrl: null,
  items: [],
  finishes: [],
  electrical: [],
  versions: [],
  focusRoomId: null,
  selectedItemId: null,
  selectedElement: null,
  carryingItemId: null,
  selectedRoomIds: [],
  generated: false,
  structureLocked: true,
  clipboard: null,
  pendingPicks: false,
  step: 1,
  saveState: 'idle',
  history: emptyHistory(),
  planSerial: 0,
};

const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export type DesignStore = DesignState & DesignActions;

/**
 * One drawing board, made twice.
 *
 * The Design Studio and the calculator each edit a plan, and they are not the same plan: a
 * flat someone is furnishing in 3D has nothing to do with the flat they are pricing a
 * renovation for, and finding the other one waiting was the single most confusing thing
 * about the two products sharing an engine. So the store is a factory over its localStorage
 * key, and there are two of them — `useDesignStore` for the studio, `useCalculatorPlanStore`
 * for the calculator's first step. Work crosses between them only when the person asks for
 * it: "see it in 3D" from the calculator's summary, "calculate the costs" from a design.
 */
function createDesignStore(storageName: string) {
  return create<DesignStore>()(
  persist(
    (set, get) => {
      /** Applies a change after recording the present, so it can be undone. */
      const commit = (recipe: (s: DesignState & DesignActions) => Partial<DesignState> | null) =>
        set((s) => {
          const next = recipe(s);
          if (!next) return s;
          return { ...next, history: pushHistory(s.history, snapshotOf(s)) };
        });

      /** A plan edit that changed the rooms: prune what belonged to rooms that are gone, re-home the rest. */
      const reconcile = (s: DesignState, plan: FloorPlan): Partial<DesignState> => {
        const rooms = new Set(plan.rooms.map((r) => r.id));
        const items = s.items.flatMap((item) => {
          if (rooms.has(item.roomId)) return [item];
          // Its room merged into a neighbour: the piece stays where it stands if a room is there.
          const home = plan.rooms.find((r) => pointInPolygon(item.position, r.polygon));
          return home ? [{ ...item, roomId: home.id }] : [];
        });
        const finishes = fitToPlan(keepChosen(defaultFinishes(plan, s.styleId), s.finishes.filter((f) => rooms.has(f.roomId))), plan);
        const electrical = reprojectElectrical(
          s.electrical.filter((p) => rooms.has(p.roomId)),
          plan
        );
        return {
          plan,
          items,
          finishes,
          electrical,
          focusRoomId: s.focusRoomId && rooms.has(s.focusRoomId) ? s.focusRoomId : null,
          selectedItemId: s.selectedItemId && items.some((i) => i.id === s.selectedItemId) ? s.selectedItemId : null,
        };
      };

      const withWalls = (s: DesignState, walls: Wall[]): Partial<DesignState> | null => {
        if (!s.plan) return null;
        return reconcile(s, rebuildRooms(s.plan, walls));
      };

      return {
        ...initial,
        setSaveState: (saveState) => set({ saveState }),

        // Renovation needs a starting state to price from; white frame is the common case.
        setMode: (mode) => set((s) => ({ mode, modeChosen: true, homeState: mode === 'full' ? (s.homeState ?? 'white_frame') : s.homeState })),
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
                { styleId, budgetGel, rooms: plan?.rooms }
              )
            ),
          });
        },
        setStyleProfile: (styleProfile) => set({ styleProfile }),
        toggleExcluded: (productId) => set((s) => ({ excluded: s.excluded.includes(productId) ? s.excluded.filter((id) => id !== productId) : [...s.excluded, productId] })),
        setExcluded: (excluded) => set({ excluded: [...new Set(excluded)] }),

        setBudget: (budgetGel, catalog) => {
          const { items, styleId, plan } = get();
          set({ budgetGel });
          if (items.length === 0 || catalog.length === 0) return;
          set({ items: placeableOnly(matchProducts(items, catalog, { styleId, budgetGel, rooms: plan?.rooms })) });
        },

        setPlan: (incoming, floorPlanUrl) =>
          set((s) => {
            const plan = ensureWalls(incoming);
            return {
              plan,
              floorPlanUrl: floorPlanUrl ?? s.floorPlanUrl,
              finishes: defaultFinishes(plan, s.styleId),
              // A new plan is a new flat: the furniture laid out against the old one, the
              // calculator's picks for it, the wiring and the kept versions are gone with it.
              items: [],
              electrical: [],
              versions: [],
              calculatorPicks: null,
              focusRoomId: null,
              selectedItemId: null,
              selectedElement: null,
              selectedRoomIds: [],
              // A new flat has not been laid out, whatever the last one had.
              generated: false,
              // …and a new project on the server: the next save gets its own row.
              projectId: null,
              history: emptyHistory(),
              planSerial: s.planSerial + 1,
            };
          }),

        updatePlan: (plan) => commit((s) => reconcile(s, withBounds(plan))),

        setPlanDefaults: (patch) =>
          commit((s) => (s.plan ? { plan: { ...s.plan, ...patch } } : null)),

        openSaved: ({ projectId = null, plan, scene, floorPlanUrl, homeState, versions = [] }) =>
          set((s) => ({
            planSerial: s.planSerial + 1,
            projectId,
            pendingPicks: false,
            plan: ensureWalls(plan),
            floorPlanUrl,
            homeState,
            mode: scene.mode,
            modeChosen: true,
            styleId: scene.styleId,
            styleProfile: scene.styleProfile ?? null,
            excluded: scene.excluded ?? [],
            budgetGel: scene.budgetGel,
            items: scene.items,
            finishes: scene.finishes,
            electrical: scene.electrical ?? [],
            versions,
            calculatorPicks: null,
            focusRoomId: null,
            selectedItemId: null,
            selectedElement: null,
            selectedRoomIds: [],
            generated: true,
            step: 5,
            history: emptyHistory(),
          })),

        updateRoom: (roomId, patch) =>
          commit((s) => {
            if (!s.plan) return null;
            return {
              plan: {
                ...s.plan,
                rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
              },
            };
          }),

        resizeRoom: (roomId, widthM, depthM) =>
          commit((s) => {
            if (!s.plan) return null;
            const room = s.plan.rooms.find((r) => r.id === roomId);
            if (!room) return null;
            const bounds = polygonBounds(room.polygon);

            // A plan built from walls resizes by moving the room's far walls, so the drawing
            // stays joined up; a plan without walls scales the outline as before.
            if (s.plan.walls && s.plan.walls.length > 0 && room.wallIds) {
              let walls = s.plan.walls;
              const dx = widthM - bounds.width;
              const dz = depthM - bounds.depth;
              const moveSide = (pick: (p: Vec2) => boolean, delta: number, axis: 'x' | 'z') => {
                const done = new Set<string>();
                room.polygon.forEach((p, i) => {
                  const q = room.polygon[(i + 1) % room.polygon.length];
                  if (!pick(p) || !pick(q)) return;
                  const wallId = room.wallIds?.[i];
                  if (!wallId || done.has(wallId)) return;
                  done.add(wallId);
                  const wall = walls.find((w) => w.id === wallId);
                  if (!wall) return;
                  // The wall's normal may point either way; move it along the axis asked for.
                  const dir = { x: wall.b.x - wall.a.x, z: wall.b.z - wall.a.z };
                  const normal = { x: -dir.z, z: dir.x };
                  const sign = axis === 'x' ? Math.sign(normal.x) || 1 : Math.sign(normal.z) || 1;
                  walls = offsetWallIn(walls, wallId, delta * sign);
                });
              };
              if (Math.abs(dx) > 0.001) moveSide((p) => Math.abs(p.x - bounds.maxX) < 1e-6, dx, 'x');
              if (Math.abs(dz) > 0.001) moveSide((p) => Math.abs(p.z - bounds.maxZ) < 1e-6, dz, 'z');
              return withWalls(s, walls);
            }

            const scaleX = bounds.width > 0.01 ? widthM / bounds.width : 1;
            const scaleZ = bounds.depth > 0.01 ? depthM / bounds.depth : 1;
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
              plan: withBounds({ ...s.plan, rooms }),
              // The old layout was measured against the old outline.
              items: s.items.filter((i) => i.roomId !== roomId),
            };
          }),

        addRoom: (name) =>
          commit((s) => {
            const wallThicknessM = s.plan?.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;
            const existing = s.plan?.rooms ?? [];
            // Drop it just clear of everything else, so it never lands on top of a parsed room.
            const right = existing.length ? Math.max(...existing.flatMap((r) => r.polygon.map((p) => p.x))) + wallThicknessM + 0.4 : 0;
            const top = existing.length ? Math.min(...existing.flatMap((r) => r.polygon.map((p) => p.z))) : 0;
            const base: FloorPlan = s.plan ?? { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM, walls: [] };
            const walls = addWalls(base.walls ?? [], wallsForRectangle({ x: right, z: top, width: 4, depth: 3 }, wallThicknessM, 'user'));
            const plan = rebuildRooms(base, walls);
            const room = plan.rooms.find((r) => !existing.some((e) => e.id === r.id));
            const rooms = room ? plan.rooms.map((r) => (r.id === room.id ? { ...r, name, type: 'bedroom' as RoomType, origin: 'user' as const } : r)) : plan.rooms;
            return reconcile(s, { ...plan, rooms });
          }),

        addRectangleRoom: (rect, type, name) => {
          let created: string | null = null;
          commit((s) => {
            const wallThicknessM = s.plan?.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;
            const base: FloorPlan = s.plan ?? { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM, walls: [] };
            const before = new Set(base.rooms.map((r) => r.id));
            const walls = addWalls(base.walls ?? [], wallsForRectangle(rect, wallThicknessM, 'user'));
            const plan = rebuildRooms(base, walls);
            const centre = { x: rect.x + rect.width / 2, z: rect.z + rect.depth / 2 };
            const room = plan.rooms.find((r) => !before.has(r.id) && pointInPolygon(centre, r.polygon)) ?? plan.rooms.find((r) => !before.has(r.id));
            if (room) {
              created = room.id;
              const roomType = type ?? room.type;
              const roomName = name ?? (isAutoRoomName(room.name) ? nextRoomName(plan.rooms, roomType, room.id) : room.name);
              plan.rooms = plan.rooms.map((r) => (r.id === room.id ? { ...r, type: roomType, name: roomName, heightM: base.wallHeightM ?? ROOM_TYPES[roomType].defaultHeight, origin: 'user' as const } : r));
            }
            return reconcile(s, plan);
          });
          return created;
        },

        selectRooms: (roomIds) => set({ selectedRoomIds: roomIds }),

        moveRooms: (roomIds, delta) =>
          commit((s) => {
            if (!s.plan) return null;
            const plan = moveRoomsIn(s.plan, roomIds, delta);
            if (plan === s.plan) return null;
            const moving = new Set(roomIds);
            const shift = (p: Vec2): Vec2 => ({ x: Math.round((p.x + delta.x) * 100) / 100, z: Math.round((p.z + delta.z) * 100) / 100 });
            // Everything standing in a room travels with it: the furniture, the fittings on
            // its walls, the technical points, and whatever was painted on its floor.
            const withTechnical: FloorPlan = plan.technical
              ? { ...plan, technical: { ...plan.technical, points: plan.technical.points.map((p) => (p.roomId && moving.has(p.roomId) ? { ...p, position: shift(p.position) } : p)) } }
              : plan;
            const travelled: DesignState = {
              ...s,
              items: s.items.map((i) => (moving.has(i.roomId) ? { ...i, position: shift(i.position) } : i)),
              electrical: s.electrical.map((p) => (moving.has(p.roomId) ? { ...p, position: shift(p.position) } : p)),
              finishes: s.finishes.map((f) => (f.zone && moving.has(f.roomId) ? { ...f, zone: { ...f.zone, polygon: f.zone.polygon.map(shift) } } : f)),
            };
            return reconcile(travelled, withTechnical);
          }),

        removeRoom: (roomId) =>
          commit((s) => {
            if (!s.plan) return null;
            const room = s.plan.rooms.find((r) => r.id === roomId);
            if (!room) return null;
            // Take away the walls only this room used; a shared wall stays for its neighbour.
            const walls = s.plan.walls ?? [];
            if (walls.length > 0 && room.wallIds) {
              const shared = new Set(s.plan.rooms.filter((r) => r.id !== roomId).flatMap((r) => r.wallIds ?? []));
              const gone = new Set((room.wallIds ?? []).filter((id) => !shared.has(id)));
              const kept = walls.filter((w) => !gone.has(w.id));
              const plan = rebuildRooms(s.plan, kept);
              // The room's area may now be a bounded face again (fully shared walls): drop it explicitly.
              plan.rooms = plan.rooms.filter((r) => r.id !== roomId);
              return reconcile(s, plan);
            }
            return reconcile(s, withBounds({ ...s.plan, rooms: s.plan.rooms.filter((r) => r.id !== roomId) }));
          }),

        // --- walls, columns, beams ---
        setWalls: (walls) => commit((s) => withWalls(s, walls)),
        addWall: (wall) => {
          const id = uid('w');
          commit((s) => {
            if (!s.plan) return null;
            const walls = addWalls(s.plan.walls ?? [], [{ ...wall, id, origin: wall.origin ?? 'user' }]);
            return withWalls(s, walls);
          });
          return id;
        },
        offsetWall: (wallId, distance) => commit((s) => (s.plan?.walls ? withWalls(s, markUser(offsetWallIn(s.plan.walls, wallId, distance), wallId)) : null)),
        moveWallNode: (from, to) => commit((s) => (s.plan?.walls ? withWalls(s, moveWallNodeIn(s.plan.walls, from, to)) : null)),
        updateWall: (wallId, patch) => commit((s) => (s.plan?.walls ? withWalls(s, updateWallIn(s.plan.walls, wallId, patch)) : null)),
        resizeWall: (wallId, lengthM) => commit((s) => (s.plan?.walls ? withWalls(s, markUser(resizeWallIn(s.plan.walls, wallId, lengthM), wallId)) : null)),
        removeWall: (wallId) => commit((s) => (s.plan?.walls ? withWalls(s, removeWallIn(s.plan.walls, wallId)) : null)),

        addColumn: (position, size = {}) => {
          const id = uid('c');
          commit((s) => (s.plan ? { plan: { ...s.plan, columns: [...(s.plan.columns ?? []), { id, position, widthM: size.widthM ?? 0.3, depthM: size.depthM ?? 0.3, ...(size.heightM ? { heightM: size.heightM } : {}), material: size.material ?? 'concrete', origin: 'user' }] } } : null));
          return id;
        },
        updateColumn: (id, patch) => commit((s) => (s.plan ? { plan: { ...s.plan, columns: (s.plan.columns ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) } } : null)),
        removeColumn: (id) => commit((s) => (s.plan ? { plan: { ...s.plan, columns: (s.plan.columns ?? []).filter((c) => c.id !== id) } } : null)),
        addBeam: (a, b, size = {}) => {
          const id = uid('b');
          commit((s) => (s.plan ? { plan: { ...s.plan, beams: [...(s.plan.beams ?? []), { id, a, b, widthM: size.widthM ?? 0.25, depthM: size.depthM ?? 0.35, elevationM: size.elevationM ?? Math.max(1.8, (s.plan.wallHeightM ?? 2.8) - 0.35), material: size.material ?? 'concrete', origin: 'user' }] } } : null));
          return id;
        },
        updateBeam: (id, patch) => commit((s) => (s.plan ? { plan: { ...s.plan, beams: (s.plan.beams ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)) } } : null)),
        removeBeam: (id) => commit((s) => (s.plan ? { plan: { ...s.plan, beams: (s.plan.beams ?? []).filter((b) => b.id !== id) } } : null)),

        // --- technical ---
        addTechnicalPoint: (kind, position, roomId) => {
          const id = uid('t');
          commit((s) => {
            if (!s.plan) return null;
            const room = roomId ? s.plan.rooms.find((r) => r.id === roomId) : s.plan.rooms.find((r) => pointInPolygon(position, r.polygon));
            // An air conditioner hangs from the ceiling down, so its height is the room's.
            const point: TechnicalPoint = { id, kind, roomId: room?.id ?? null, position, elevationM: technicalElevation(kind, room), origin: 'user' };
            return { plan: { ...s.plan, technical: { points: [...(s.plan.technical?.points ?? []), point], works: s.plan.technical?.works } } };
          });
          return id;
        },
        updateTechnicalPoint: (id, patch) =>
          commit((s) => {
            if (!s.plan?.technical) return null;
            const plan = s.plan;
            return {
              plan: {
                ...plan,
                technical: {
                  ...plan.technical!,
                  points: plan.technical!.points.map((p) => {
                    if (p.id !== id) return p;
                    const next = { ...p, ...patch };
                    // Re-kinding takes the new kind's usual height unless one was asked for
                    // in the same breath — otherwise a socket turned into an air
                    // conditioner stayed at 45 cm off the floor.
                    if (patch.kind && patch.kind !== p.kind && patch.elevationM === undefined) {
                      next.elevationM = technicalElevation(patch.kind, plan.rooms.find((r) => r.id === p.roomId));
                    }
                    return next;
                  }),
                },
              },
            };
          }),
        removeTechnicalPoint: (id) =>
          commit((s) => (s.plan?.technical ? { plan: { ...s.plan, technical: { ...s.plan.technical, points: s.plan.technical.points.filter((p) => p.id !== id) } } } : null)),
        setRadiatorProduct: (id, product) =>
          commit((s) => {
            if (!s.plan?.technical) return null;
            const plan = s.plan;
            return { plan: { ...plan, technical: { ...plan.technical!, points: plan.technical!.points.map((p) => (p.id === id ? { ...withRadiatorProduct(plan, p, product), origin: p.origin } : p)) } } };
          }),
        suggestRadiators: (catalog = []) => {
          let hung = 0;
          commit((s) => {
            if (!s.plan) return null;
            let n = 0;
            const added = suggestRadiators(s.plan, () => `${uid('t')}${n++}`);
            if (added.length === 0) return null;
            hung = added.length;
            const plan: FloorPlan = { ...s.plan, technical: { points: [...(s.plan.technical?.points ?? []), ...added], works: s.plan.technical?.works } };
            return { plan: withRadiatorProducts(plan, catalog, s.styleId) };
          });
          return hung;
        },
        ensureRadiatorProducts: (catalog) => {
          const { plan, styleId } = get();
          if (!plan || catalog.length === 0) return;
          const next = withRadiatorProducts(plan, catalog, styleId);
          if (next !== plan) set({ plan: next });
        },
        suggestTechnical: () => {
          let placed = 0;
          commit((s) => {
            if (!s.plan) return null;
            let n = 0;
            const { points } = suggestTechnicalIn(s.plan, s.items, () => `${uid('t')}${n++}`);
            if (points.length === 0) return null;
            placed = points.length;
            return { plan: { ...s.plan, technical: { points: [...(s.plan.technical?.points ?? []), ...points], works: s.plan.technical?.works, existing: s.plan.technical?.existing } } };
          });
          return placed;
        },
        setWorks: (works) => set((s) => (s.plan ? { plan: { ...s.plan, technical: { points: s.plan.technical?.points ?? [], works, existing: s.plan.technical?.existing } } } : s)),
        setExisting: (existing) => set((s) => (s.plan ? { plan: { ...s.plan, technical: { points: s.plan.technical?.points ?? [], works: s.plan.technical?.works, existing } } } : s)),

        // --- electrical ---
        suggestElectrical: (catalog = []) => commit((s) => (s.plan ? { electrical: withFixtureProducts(suggestElectrical(s.plan, s.items, s.electrical), catalog, s.styleId) } : null)),
        addElectricalPoint: (kind, position, roomId, catalog = []) => {
          const id = uid('e');
          let ok = false;
          commit((s) => {
            const room = s.plan?.rooms.find((r) => r.id === roomId);
            if (!room) return null;
            const point = withFixtureProduct(placeElectrical(room, kind, position, id), fixtureCandidates(kind, catalog, s.styleId)[0] ?? null);
            // Two plates may not occupy the same piece of wall — one ends up buried inside
            // the other, and the budget quietly pays for both.
            if (fittingClashes(room, point, s.electrical)) return null;
            ok = true;
            return { electrical: [...s.electrical, point] };
          });
          return ok ? id : null;
        },
        updateElectricalPoint: (id, patch) =>
          commit((s) => ({
            electrical: s.electrical.map((p) => {
              if (p.id !== id) return p;
              const next: ElectricalPoint = { ...p, ...patch, origin: 'user' };
              // A double socket is two of the product; a longer strip more metres.
              return next.product && (patch.count != null || patch.lengthM != null) ? { ...next, product: { ...next.product, qty: fixtureQuantityOf(next), totalPrice: round2(next.product.pricePerUnit * fixtureQuantityOf(next)) } } : next;
            }),
          })),
        changeElectricalKind: (id, kind, catalog = []) =>
          commit((s) => {
            const point = s.electrical.find((p) => p.id === id);
            const room = point ? s.plan?.rooms.find((r) => r.id === point.roomId) : null;
            if (!point || !room || point.kind === kind) return null;
            const info = ELECTRICAL_KINDS[kind];
            const changed: ElectricalPoint = { ...point, kind, elevationM: info.placement === 'ceiling' ? room.heightM : info.defaultElevationM, ...(info.count ? { count: info.count } : {}), ...(info.light ? { on: point.on ?? true, category: info.category } : {}), origin: 'user' };
            const candidates = fixtureCandidates(kind, catalog, s.styleId);
            const keep = point.product ? candidates.find((c) => c.id === point.product?.productId) : undefined;
            return { electrical: s.electrical.map((p) => (p.id === id ? withFixtureProduct(changed, keep ?? candidates[0] ?? null) : p)) };
          }),
        setElectricalProduct: (id, product) => commit((s) => ({ electrical: s.electrical.map((p) => (p.id === id ? { ...withFixtureProduct(p, product), origin: 'user' } : p)) })),
        moveElectricalPoint: (id, position) =>
          commit((s) => {
            const point = s.electrical.find((p) => p.id === id);
            const room = point ? s.plan?.rooms.find((r) => r.id === point.roomId) : null;
            if (!point || !room) return null;
            const placed = placeElectrical(room, point.kind, position, id);
            const moved = { ...point, position: placed.position, wallIndex: placed.wallIndex, t: placed.t, origin: 'user' as const };
            // Dragging one onto another is refused the same way placing one there is; the
            // viewer puts it back where it came from.
            if (fittingClashes(room, moved, s.electrical, id)) return null;
            return { electrical: s.electrical.map((p) => (p.id === id ? moved : p)) };
          }),
        slideElectricalPoint: (id, t) =>
          commit((s) => {
            const point = s.electrical.find((p) => p.id === id);
            const room = point ? s.plan?.rooms.find((r) => r.id === point.roomId) : null;
            if (!point || !room) return null;
            const moved = slideAlongWall(room, point, t);
            if (moved === point || fittingClashes(room, moved, s.electrical, id)) return null;
            return { electrical: s.electrical.map((p) => (p.id === id ? { ...moved, origin: 'user' } : p)) };
          }),
        removeElectricalPoint: (id) => commit((s) => ({ electrical: s.electrical.filter((p) => p.id !== id), selectedElement: s.selectedElement?.kind === 'electrical' && s.selectedElement.id === id ? null : s.selectedElement })),
        clearElectrical: () => commit(() => ({ electrical: [] })),

        // --- furniture ---
        generate: (catalog) => {
          const { plan, styleId, budgetGel, calculatorPicks } = get();
          if (!plan) return;
          const placed = layoutPlan(plan.rooms, { anchors: technicalAnchors(plan), obstacles: Object.fromEntries(plan.rooms.map((r) => [r.id, columnFootprints(plan, r.id)])) });
          // A slot no partner product can fill is dropped rather than shown as a stand-in.
          //
          // Laying the flat out is the journey's hinge, so it is not an undoable edit: the
          // versions kept for an earlier layout describe a flat that no longer exists and go
          // with it, and the history starts empty. One Ctrl+Z in the studio used to undo the
          // whole generation and leave every room bare — and, coming from the calculator,
          // carry on into the walls that were drawn there.
          set((s) => {
            let items = placeableOnly(matchProducts(placed, catalog, { styleId, budgetGel, rooms: plan.rooms }));
            // Re-laying out the furniture is not a reason to lose the tiles someone picked.
            let finishes = keepChosen(defaultFinishes(plan, styleId), s.finishes);
            if (calculatorPicks) {
              items = placeableOnly(applyFurniturePicks(items, plan, calculatorPicks, catalog));
              finishes = applyFinishPicks(finishes, plan, calculatorPicks, catalog);
            }
            // The wiring follows the furniture; what the person wired by hand is kept. Every
            // fitting is bought as a product where the catalogue has one — and so is every
            // door and window.
            const electrical = withFixtureProducts(suggestElectrical(plan, items, s.electrical.filter((p) => p.origin === 'user')), catalog, styleId);
            const rooms = withOpeningProducts(plan.rooms, catalog, styleId);
            return {
              items,
              finishes,
              electrical,
              selectedItemId: null,
              selectedElement: null,
              carryingItemId: null,
              ...(rooms !== plan.rooms ? { plan: { ...plan, rooms } } : {}),
              generated: true,
              versions: [],
              history: emptyHistory(),
            };
          });
        },

        clearDesign: () =>
          commit((s) => ({
            items: [],
            electrical: [],
            finishes: defaultFinishes(s.plan, s.styleId),
            selectedItemId: null,
            selectedElement: null,
            carryingItemId: null,
          })),

        startFromCalculator: ({ rooms, homeState, selectedProducts, selectedFurniture, projectId = null, plan: fromCalculator = null, floorPlanUrl = null }) => {
          let landing: 'studio' | 'style' = 'style';
          set((s) => {
            // A plan uploaded or drawn in the calculator keeps its real walls; rooms typed by
            // hand become a row of rectangles. Either way the calculator's types, names and
            // heights win.
            const ids = new Set(rooms.map((r) => r.id));
            /** A drawing of this same flat — same rooms, drawn rather than derived. */
            const describesFlat = (p: FloorPlan | null | undefined): p is FloorPlan =>
              !!p && p.source !== 'calculator' && p.rooms.length === rooms.length && p.rooms.every((r) => ids.has(r.id));
            // The calculator's own board is the drawing just left behind; the studio's is
            // what an earlier design of the same flat kept. The first wins.
            const current = describesFlat(fromCalculator) ? fromCalculator : describesFlat(s.plan) ? s.plan : null;
            const reusable = current !== null;
            let plan: FloorPlan;
            if (reusable && current) {
              const synced = current.rooms.map((pr) => {
                const cr = rooms.find((r) => r.id === pr.id)!;
                return { ...pr, type: cr.type, name: cr.nameKa, heightM: cr.height, openings: [...pr.openings] };
              });
              if (!synced.some((r) => r.openings.length > 0)) deriveOpenings(synced, current.wallThicknessM);
              plan = { ...current, rooms: synced };
            } else {
              plan = ensureWalls(planFromCalculatorRooms(rooms));
            }
            const calculatorPicks = picksFromCalculator(selectedProducts, selectedFurniture);
            // The same project already has a design: keep it, and let the studio put the
            // calculator's picks into it rather than laying the flat out again.
            const keepDesign = projectId != null && s.projectId === projectId && describesFlat(s.plan) && s.items.length > 0;
            if (keepDesign) {
              landing = 'studio';
              return { plan, planSerial: current === s.plan ? s.planSerial : s.planSerial + 1, projectId, mode: 'full', modeChosen: true, homeState, calculatorPicks, pendingPicks: true, focusRoomId: null, selectedItemId: null, generated: true, step: 5, ...(floorPlanUrl ? { floorPlanUrl } : {}) };
            }
            return {
              plan,
              floorPlanUrl: floorPlanUrl ?? s.floorPlanUrl,
              planSerial: reusable && current === s.plan ? s.planSerial : s.planSerial + 1,
              projectId,
              mode: 'full',
              modeChosen: true,
              homeState,
              calculatorPicks,
              pendingPicks: false,
              items: [],
              electrical: [],
              finishes: defaultFinishes(plan, s.styleId),
              focusRoomId: null,
              selectedItemId: null,
              // A calculation carried into 3D has not been laid out yet, and the versions
              // kept for whatever was in the studio before belong to another flat.
              generated: false,
              versions: [],
              step: 4,
              history: emptyHistory(),
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
          commit((s) => {
            if (!s.plan) return null;
            const rooms = s.plan.rooms.filter((r) => roomIds.includes(r.id));
            // The room's base finish for the surface; single walls and zones on it stay.
            const next = s.finishes.filter((f) => !(f.surface === surface && roomIds.includes(f.roomId) && isBaseFinish(f)));
            for (const room of rooms) {
              if (isTrimSurface(surface)) next.push(product ? trimFromProduct(room, surface, product) : defaultTrim(room, surface, s.styleId));
              else next.push(product ? finishFromProduct(room, surface, product) : defaultFinish(room, surface, s.styleId));
            }
            return { finishes: next };
          }),

        paintSurface: (target, product) =>
          commit((s) => {
            const room = s.plan?.rooms.find((r) => r.id === target.roomId);
            if (!room) return null;
            const finishes =
              target.surface === 'floor'
                ? paintCell(s.finishes, room, target.cell, product)
                : target.patch
                  ? paintPatch(s.finishes, room, target.wallIndex, target.patch, product)
                  : paintSpan(s.finishes, room, target.wallIndex, target.span, product);
            return finishes === s.finishes ? null : { finishes };
          }),

        clearPartialFinishes: (roomId, surface) =>
          commit((s) => {
            const finishes = s.finishes.filter((f) => !(f.roomId === roomId && f.surface === surface && !isBaseFinish(f)));
            return finishes.length === s.finishes.length ? null : { finishes, selectedElement: s.selectedElement?.kind === 'zone' ? null : s.selectedElement };
          }),

        setWallFinish: (roomId, wallIndex, product) =>
          commit((s) => {
            const room = s.plan?.rooms.find((r) => r.id === roomId);
            if (!room) return null;
            const next = s.finishes.filter((f) => !(f.roomId === roomId && f.surface === 'wall' && f.wallIndex === wallIndex));
            if (product) next.push({ ...finishFromProduct(room, 'wall', product), wallIndex, product: repriceWall(room, wallIndex, finishFromProduct(room, 'wall', product)) });
            return { finishes: next };
          }),

        addFinishZone: (roomId, zone, product) => {
          commit((s) => {
            const room = s.plan?.rooms.find((r) => r.id === roomId);
            if (!room) return null;
            const finish = product ? zoneFinish(room, zone, product) : { ...defaultFinish(room, 'floor', s.styleId), zone, origin: 'studio' as const };
            return { finishes: [...s.finishes, finish], selectedElement: { kind: 'zone', id: zone.id, roomId } };
          });
          return zone.id;
        },
        updateFinishZone: (roomId, zoneId, patch) =>
          commit((s) => {
            const room = s.plan?.rooms.find((r) => r.id === roomId);
            if (!room) return null;
            const current = s.finishes.find((f) => f.roomId === roomId && f.zone?.id === zoneId);
            if (!current) return null;
            const zone = patch.zone ?? current.zone!;
            if (patch.product === null) return { finishes: s.finishes.filter((f) => f !== current) };
            const product = patch.product ?? null;
            const next = product ? zoneFinish(room, zone, product) : { ...current, zone, product: current.product ? { ...current.product, qty: zoneArea(zone), totalPrice: round2(current.product.pricePerUnit * zoneArea(zone)) } : null };
            return { finishes: s.finishes.map((f) => (f === current ? next : f)) };
          }),
        removeFinishZone: (roomId, zoneId) => commit((s) => ({ finishes: s.finishes.filter((f) => !(f.roomId === roomId && f.zone?.id === zoneId)), selectedElement: s.selectedElement?.kind === 'zone' && s.selectedElement.id === zoneId ? null : s.selectedElement })),

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
          commit((s) => ({ items: placed, selectedItemId: id, focusRoomId: s.focusRoomId ?? null }));
          return id;
        },

        beginAdd: (product, roomId) => {
          const { plan, carryingItemId } = get();
          // Whatever is still riding on the pointer goes back: choosing a second tile off the
          // shelf is changing your mind about the first, not asking for both. Without this
          // the abandoned piece stayed wherever the automatic spot had put it, which looked
          // exactly like the shelf placing furniture by itself.
          const items = carryingItemId ? get().items.filter((i) => i.id !== carryingItemId) : get().items;
          const kind = product.model3dKind;
          const archetype = kind ? getArchetype(kind) : undefined;
          if (!plan || !kind || !archetype || !product.model3dUrl) return null;
          const size =
            product.widthCm && product.depthCm && product.heightCm
              ? { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 }
              : archetype.size;
          // A free spot when there is one, so a click without moving already lands; otherwise
          // the middle of the room, shown red until the pointer carries it somewhere it fits.
          // For the whole flat, the rooms are tried largest first and the first with space wins.
          const candidates = roomId ? plan.rooms.filter((r) => r.id === roomId) : [...plan.rooms].sort((a, b) => b.areaM2 - a.areaM2);
          if (candidates.length === 0) return null;
          let room = candidates[0];
          let found: PlacedItem | null = null;
          for (const candidate of candidates) {
            found = placeAdditional(candidate, kind, items, size);
            if (found) {
              room = candidate;
              break;
            }
          }
          const centre = polygonCentroid(room.polygon);
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
          commit(() => ({ items: placed, selectedItemId: id, carryingItemId: id, selectedElement: null }));
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

        addOpening: (roomId, kind, wallIndex = null, catalog = []) => {
          const { plan, styleId } = get();
          if (!plan) return null;
          const result = addOpeningTo(plan.rooms, roomId, kind, wallIndex, plan.wallThicknessM);
          if (!result.openingId) return null;
          commit(() => ({ plan: { ...plan, rooms: withOpeningProducts(markOpeningUser(result.rooms, result.openingId!), catalog, styleId) } }));
          return result.openingId;
        },
        dropOpening: (kind, target, catalog = []) => {
          const { plan, styleId } = get();
          if (!plan) return null;
          const result = addOpeningTo(plan.rooms, target.roomId, kind, target.wallIndex, plan.wallThicknessM, { t: target.t });
          if (!result.openingId) return null;
          commit(() => ({ plan: { ...plan, rooms: withOpeningProducts(markOpeningUser(result.rooms, result.openingId!), catalog, styleId) } }));
          return result.openingId;
        },
        moveOpening: (roomId, openingId, t) =>
          commit((s) => (s.plan ? { plan: { ...s.plan, rooms: moveOpeningIn(s.plan.rooms, roomId, openingId, t) } } : null)),
        moveOpeningToWall: (roomId, openingId, target) => {
          const { plan } = get();
          if (!plan) return null;
          const result = moveOpeningToWallIn(plan.rooms, roomId, openingId, target, plan.wallThicknessM);
          if (!result.openingId) return null;
          commit(() => ({ plan: { ...plan, rooms: result.rooms } }));
          return result.openingId;
        },
        updateOpening: (roomId, openingId, patch, catalog = []) =>
          commit((s) => {
            if (!s.plan) return null;
            const { widthM, heightM, sillM, kind, ...rest } = patch;
            let rooms = s.plan.rooms;
            if (widthM != null || heightM != null || sillM != null || kind != null) {
              rooms = updateOpeningIn(rooms, roomId, openingId, { ...(widthM != null ? { widthM } : {}), ...(heightM != null ? { heightM } : {}), ...(sillM != null ? { sillM } : {}), ...(kind != null ? { kind } : {}) });
              // A door that became a window (or the reverse) buys a product of its new kind.
              if (kind != null) rooms = withOpeningProducts(rooms, catalog, s.styleId);
            }
            if (Object.keys(rest).length > 0) {
              // Material, angle and lock apply to both halves of an interior door; the hinge
              // and the swing are mirrored on the twin, which sees the same leaf from the
              // other room (its edge runs the other way).
              const room = rooms.find((r) => r.id === roomId);
              const opening = room?.openings.find((o) => o.id === openingId);
              const twin = opening ? twinOf(rooms, opening) : null;
              const mirrored: typeof rest = { ...rest, ...(rest.hinge ? { hinge: mirrorHinge(rest.hinge) } : {}), ...(rest.swing ? { swing: mirrorSwing(rest.swing) } : {}) };
              const patchIn = (r: PlanRoom, id: string, patch: typeof rest) => ({ ...r, openings: r.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
              rooms = rooms.map((r) => {
                if (r.id === roomId) return patchIn(r, openingId, rest);
                if (twin && r.id === twin.room.id) return patchIn(r, twin.opening.id, mirrored);
                return r;
              });
            }
            return { plan: { ...s.plan, rooms } };
          }),
        setOpeningProduct: (roomId, openingId, product) =>
          commit((s) => (s.plan ? { plan: { ...s.plan, rooms: markOpeningUser(setOpeningProductIn(s.plan.rooms, roomId, openingId, product), openingId) } } : null)),
        ensureOpeningProducts: (catalog) => {
          const { plan, styleId } = get();
          if (!plan || catalog.length === 0) return;
          const rooms = withOpeningProducts(plan.rooms, catalog, styleId);
          if (rooms !== plan.rooms) set({ plan: { ...plan, rooms } });
        },
        setOpeningWall: (roomId, openingId, wallIndex) =>
          commit((s) => (s.plan ? { plan: { ...s.plan, rooms: setOpeningWallIn(s.plan.rooms, roomId, openingId, wallIndex, s.plan.wallThicknessM) } } : null)),
        removeOpening: (roomId, openingId) =>
          commit((s) => (s.plan ? { plan: { ...s.plan, rooms: removeOpeningFrom(s.plan.rooms, roomId, openingId) }, selectedElement: s.selectedElement?.kind === 'opening' && s.selectedElement.id === openingId ? null : s.selectedElement } : null)),

        swapProduct: (itemId, product) => commit((s) => ({ items: applySwap(s.items, itemId, product) })),

        placeItem: (itemId, position, rotation, roomId) =>
          commit((s) => ({
            items: s.items.map((item) =>
              item.id === itemId
                ? { ...item, position, rotation, roomId: roomId ?? item.roomId }
                : item
            ),
          })),

        removeItem: (itemId) =>
          commit((s) => ({
            items: s.items.filter((i) => i.id !== itemId),
            selectedItemId: s.selectedItemId === itemId ? null : s.selectedItemId,
          })),

        mirrorItem: (itemId) => commit((s) => ({ items: s.items.map((i) => (i.id === itemId ? { ...i, mirrored: !i.mirrored, pinned: true } : i)) })),
        lockItem: (itemId, locked) => set((s) => ({ items: s.items.map((i) => (i.id === itemId ? { ...i, locked } : i)) })),

        duplicateItem: (itemId) => {
          const { items, plan } = get();
          const source = items.find((i) => i.id === itemId);
          const room = source ? plan?.rooms.find((r) => r.id === source.roomId) : null;
          if (!source || !room) return null;
          const copy = besideCopy(room, source, items);
          commit(() => ({ items: [...items, copy], selectedItemId: copy.id }));
          return copy.id;
        },
        copyItem: (itemId) => set((s) => ({ clipboard: s.items.find((i) => i.id === itemId) ?? s.clipboard })),
        pasteItem: (roomId) => {
          const { clipboard, plan, items } = get();
          if (!clipboard || !plan) return null;
          const room = plan.rooms.find((r) => r.id === (roomId ?? clipboard.roomId)) ?? plan.rooms.find((r) => r.id === clipboard.roomId);
          if (!room) return null;
          const copy = besideCopy(room, { ...clipboard, roomId: room.id }, items);
          commit(() => ({ items: [...items, copy], selectedItemId: copy.id }));
          return copy.id;
        },

        setFocusRoom: (focusRoomId) => set({ focusRoomId }),
        selectItem: (selectedItemId) => set((s) => ({ selectedItemId, selectedElement: selectedItemId ? null : s.selectedElement })),
        selectElement: (selectedElement) => set((s) => ({ selectedElement, selectedItemId: selectedElement ? null : s.selectedItemId })),
        setStructureLocked: (structureLocked) => set({ structureLocked }),

        // --- history and versions ---
        undo: () =>
          set((s) => {
            const result = undoHistory(s.history, snapshotOf(s));
            if (!result) return s;
            return { ...result.snapshot, history: result.history, selectedItemId: null, selectedElement: null, carryingItemId: null };
          }),
        redo: () =>
          set((s) => {
            const result = redoHistory(s.history, snapshotOf(s));
            if (!result) return s;
            return { ...result.snapshot, history: result.history, selectedItemId: null, selectedElement: null, carryingItemId: null };
          }),

        ensureExistingVersion: (name) =>
          set((s) => {
            if (!s.plan || s.versions.some((v) => v.kind === 'existing')) return s;
            // The baseline is the flat as the studio first found it — furniture, fittings,
            // finishes and all. It used to be taken when step 2 was left, which is before
            // anything has been laid out, so restoring it emptied the rooms.
            //
            // The undo history starts here too. Drawing a flat on step 2 is a long run of
            // undoable edits, and carrying it into the studio meant one Ctrl+Z too many
            // walked the walls back to the blank sheet.
            return { versions: [versionOf(s, name, 'existing'), ...s.versions].slice(0, MAX_VERSIONS), history: emptyHistory() };
          }),
        saveVersion: (name, kind = 'manual') => {
          const version = versionOf(get(), name, kind);
          set((s) => ({ versions: [...s.versions, version].slice(-MAX_VERSIONS) }));
          return version.id;
        },
        restoreVersion: (versionId, keepCurrentAs) =>
          set((s) => {
            const version = s.versions.find((v) => v.id === versionId);
            if (!version) return s;
            // The present is kept as a version, unless it is already identical to one.
            const current = versionOf(s, keepCurrentAs, 'auto');
            const unchanged = s.versions.some((v) => JSON.stringify(v.plan) === JSON.stringify(current.plan) && JSON.stringify(v.scene) === JSON.stringify(current.scene));
            const versions = unchanged ? s.versions : [...s.versions, current].slice(-MAX_VERSIONS);
            return {
              versions,
              plan: version.plan,
              items: version.scene.items,
              finishes: version.scene.finishes,
              electrical: version.scene.electrical ?? [],
              styleId: version.scene.styleId,
              selectedItemId: null,
              selectedElement: null,
              carryingItemId: null,
              history: pushHistory(s.history, snapshotOf(s)),
            };
          }),
        renameVersion: (versionId, name) => set((s) => ({ versions: s.versions.map((v) => (v.id === versionId ? { ...v, name } : v)) })),
        deleteVersion: (versionId) => set((s) => ({ versions: s.versions.filter((v) => v.id !== versionId) })),

        setStep: (step) => set({ step }),
        reset: () => set((s) => ({ ...initial, history: emptyHistory(), planSerial: s.planSerial + 1 })),

        scene: () => {
          const { styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded } = get();
          return { styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded };
        },
      };
    },
    {
      name: storageName,
      storage: createJSONStorage(() => localStorage),
      version: PERSIST_VERSION,
      migrate: migratePersisted,
      // `migrate` only runs when the version changed; a plan of the current version is
      // rehydrated as it was saved, so what `ensureWalls` normalises (door twins agreeing on
      // one leaf, walls for an old polygon plan) is put right here on every load.
      merge: (persisted, current) => {
        const next = { ...current, ...(persisted as Partial<DesignState>) };
        return next.plan ? { ...next, plan: ensureWalls(next.plan) } : next;
      },
      // `scene` is a getter, not state; persisting the catalogue would go stale; the history
      // and the selection are facts about this session.
      partialize: (s) => ({
        mode: s.mode,
        modeChosen: s.modeChosen,
        homeState: s.homeState,
        projectId: s.projectId,
        calculatorPicks: s.calculatorPicks,
        styleId: s.styleId,
        styleProfile: s.styleProfile,
        excluded: s.excluded,
        budgetGel: s.budgetGel,
        plan: s.plan,
        floorPlanUrl: s.floorPlanUrl,
        items: s.items,
        finishes: s.finishes,
        electrical: s.electrical,
        versions: s.versions,
        step: s.step,
        generated: s.generated,
      }),
    }
  )
  );
}

/** The Design Studio's board — the eight-step journey's plan, scene, versions and history. */
export const useDesignStore = createDesignStore('renovate-design');

/**
 * The calculator's own board, in its own localStorage. Same machine, different flat: the
 * calculator's first step draws here and reads its rooms off it (`hooks/useCalculatorPlan`),
 * and nothing it does shows up in the studio.
 */
export const useCalculatorPlanStore = createDesignStore('renovate-calculator-plan');

/** Either board, for a component that can be pointed at one (`PlanWorkspace`). */
export type DesignStoreHook = typeof useDesignStore;

function snapshotOf(s: DesignState): DesignSnapshot {
  return { plan: s.plan, items: s.items, finishes: s.finishes, electrical: s.electrical };
}

function versionOf(s: DesignState, name: string, kind: DesignVersion['kind']): DesignVersion {
  return {
    id: uid('v'),
    name,
    kind,
    createdAt: new Date().toISOString(),
    plan: s.plan as FloorPlan,
    scene: { styleId: s.styleId, mode: s.mode, budgetGel: s.budgetGel, items: s.items, finishes: s.finishes, electrical: s.electrical, styleProfile: s.styleProfile },
  };
}

/** Keeps only the items that ended up with a real partner model behind them. */
function placeableOnly(items: PlacedItem[]): PlacedItem[] {
  return items.filter((item) => !!item.product?.model3dUrl);
}

/** Default floor/wall/ceiling finishes from the style — tiles in the wet rooms — and its skirting board and cornice. */
function defaultFinishes(plan: FloorPlan | null, styleId: StyleId): SurfaceFinish[] {
  if (!plan) return [];
  const surfaces = ['floor', 'wall', 'ceiling'] as const;
  return plan.rooms.flatMap((room) => [...surfaces.map((surface) => defaultFinish(room, surface, styleId)), defaultTrim(room, 'skirting', styleId), defaultTrim(room, 'cornice', styleId)]);
}

/**
 * What was painted on part of a room has to still be on the room after its walls moved: a
 * strip past the end of a wall that got shorter, a wall the outline no longer has, a floor
 * tile the room no longer reaches are dropped rather than priced and drawn in thin air.
 */
function fitToPlan(finishes: SurfaceFinish[], plan: FloorPlan): SurfaceFinish[] {
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  return finishes.flatMap((finish) => {
    const room = rooms.get(finish.roomId);
    if (!room) return [];
    if (finish.wallIndex != null) {
      const edge = roomEdges(room.polygon).find((e) => e.index === finish.wallIndex);
      if (!edge) return [];
      if (finish.span) {
        const to = Math.min(finish.span.to, edge.length);
        if (to - finish.span.from < 0.05) return [];
        if (to !== finish.span.to) return [{ ...finish, span: { from: finish.span.from, to } }];
      }
    }
    if (finish.cells) {
      // Floor tiles are squares of the room's grid; on a wall the same list is patches of
      // that wall's own grid, so each is measured against the thing it was painted on.
      const kept =
        finish.surface === 'wall' && finish.wallIndex != null
          ? finish.cells.filter((cell) => patchInRange(room, finish.wallIndex!, cell))
          : finish.cells.filter((cell) => cellPolygon(room, cell).length > 0);
      if (kept.length === 0) return [];
      if (kept.length !== finish.cells.length) return [{ ...finish, cells: kept }];
    }
    return [finish];
  });
}

/** Defaults, except where a room already has a finish somebody chose; single walls and zones ride along. */
function keepChosen(defaults: SurfaceFinish[], current: SurfaceFinish[]): SurfaceFinish[] {
  const base = defaults.map(
    (d) => current.find((c) => c.roomId === d.roomId && c.surface === d.surface && isBaseFinish(c) && c.product) ?? d
  );
  const extras = current.filter((c) => !isBaseFinish(c) && defaults.some((d) => d.roomId === c.roomId));
  return [...base, ...extras];
}

/** A wall a person moved is theirs from then on. */
function markUser(walls: Wall[], wallId: string): Wall[] {
  return walls.map((w) => (w.id === wallId && w.origin === 'existing' ? { ...w, origin: 'user' } : w));
}

/** An opening the person added is theirs — and so is its twin on the other side of the wall. */
function markOpeningUser(rooms: PlanRoom[], openingId: string): PlanRoom[] {
  const room = rooms.find((r) => r.openings.some((o) => o.id === openingId));
  const opening = room?.openings.find((o) => o.id === openingId);
  const twin = opening ? twinOf(rooms, opening) : null;
  const ids = new Set([openingId, ...(twin ? [twin.opening.id] : [])]);
  return rooms.map((r) => ({ ...r, openings: r.openings.map((o) => (ids.has(o.id) ? { ...o, origin: 'user' as const } : o)) }));
}

function zoneArea(zone: FinishZone): number {
  let sum = 0;
  for (let i = 0; i < zone.polygon.length; i++) {
    const a = zone.polygon[i];
    const b = zone.polygon[(i + 1) % zone.polygon.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.round(Math.abs(sum / 2) * 100) / 100;
}

function zoneFinish(room: PlanRoom, zone: FinishZone, product: CatalogProduct): SurfaceFinish {
  const base = finishFromProduct(room, 'floor', product);
  const qty = zoneArea(zone);
  return { ...base, zone, product: base.product ? { ...base.product, qty, totalPrice: round2(base.product.pricePerUnit * qty) } : null };
}

function repriceWall(room: PlanRoom, wallIndex: number, finish: SurfaceFinish): SurfaceFinish['product'] {
  if (!finish.product) return null;
  const edge = room.polygon.length > wallIndex ? { a: room.polygon[wallIndex], b: room.polygon[(wallIndex + 1) % room.polygon.length] } : null;
  const length = edge ? Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z) : 0;
  const openings = room.openings.filter((o) => o.wallIndex === wallIndex).reduce((s, o) => s + o.widthM * o.heightM, 0);
  const qty = Math.max(0.1, Math.round((length * room.heightM - openings) * 10) / 10);
  return { ...finish.product, qty, totalPrice: round2(finish.product.pricePerUnit * qty) };
}

/** A copy of an item beside the original, on free floor, or half a metre over when there is none. */
function besideCopy(room: PlanRoom, source: PlacedItem, items: PlacedItem[]): PlacedItem {
  const id = `${source.id}-copy-${Date.now().toString(36)}`;
  const spot = placeAdditional(room, source.kind, items, source.size);
  const base: PlacedItem = { ...source, id, roomId: room.id, pinned: true, origin: 'studio', locked: false };
  if (spot) return { ...base, position: spot.position, rotation: spot.rotation };
  const forward = { x: Math.sin(source.rotation), z: Math.cos(source.rotation) };
  const right = { x: forward.z, z: -forward.x };
  for (const step of [source.size.width + 0.1, -(source.size.width + 0.1), source.size.depth + 0.4]) {
    const candidate = { ...base, position: { x: source.position.x + right.x * step, z: source.position.z + right.z * step } };
    if (isPlacementValid(room, candidate, items)) return candidate;
  }
  return { ...base, position: { x: source.position.x + 0.5, z: source.position.z + 0.5 } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Bump when the persisted shape changes. Anything that fails validation is dropped rather
 * than rehydrated: a stale plan from a previous release would otherwise reach the layout
 * engine and the viewer with fields missing and fail somewhere far from here. Version 1
 * (the five-step studio) is carried over: its steps are renumbered and its plan gets walls.
 */
const persistedSchema = z.object({
  mode: z.enum(['full', 'design_only']),
  modeChosen: z.boolean().optional(),
  homeState: z.enum(['old_renovation', 'black_frame', 'white_frame', 'green_frame']).nullable(),
  projectId: z.number().int().positive().nullable().optional(),
  calculatorPicks: z
    .object({
      furniture: z.array(z.object({ roomId: z.string(), productId: z.number().int() })),
      productIds: z.array(z.number().int()),
      roomProducts: z.array(z.object({ roomId: z.string(), productId: z.number().int() })).optional(),
    })
    .nullable(),
  styleId: z.enum(['modern', 'scandinavian', 'industrial', 'vintage']),
  styleProfile: styleProfileSchema.nullable().optional(),
  budgetGel: z.number().nullable(),
  plan: floorPlanSchema.nullable(),
  floorPlanUrl: z.string().nullable(),
  items: z.array(placedItemSchema),
  finishes: z.array(surfaceFinishSchema),
  electrical: z.array(electricalPointSchema).optional(),
  versions: z.array(designVersionSchema).optional(),
  step: z.number().int().min(1).max(8),
});

const V1_STEP: Record<number, StudioStep> = { 1: 1, 2: 2, 3: 4, 4: 5, 5: 7 };

function migratePersisted(persisted: unknown, version: number): DesignState {
  if (version !== PERSIST_VERSION && version !== 1) return { ...initial };
  const parsed = persistedSchema.safeParse(persisted);
  if (!parsed.success) return { ...initial };
  const plan = parsed.data.plan ? ensureWalls(parsed.data.plan as FloorPlan) : null;
  const step = version === 1 ? (V1_STEP[parsed.data.step] ?? 1) : (parsed.data.step as StudioStep);
  return {
    ...initial,
    ...parsed.data,
    // Work saved before the choice existed already has a mode; only a blank slate asks.
    modeChosen: parsed.data.modeChosen ?? parsed.data.plan != null,
    projectId: parsed.data.projectId ?? null,
    styleProfile: parsed.data.styleProfile ?? null,
    plan,
    items: parsed.data.items as PlacedItem[],
    finishes: parsed.data.finishes as SurfaceFinish[],
    electrical: (parsed.data.electrical ?? []) as ElectricalPoint[],
    versions: (parsed.data.versions ?? []) as DesignVersion[],
    step,
    history: emptyHistory(),
  };
}

export type { CatalogProduct };
export { toCounterClockwise };
