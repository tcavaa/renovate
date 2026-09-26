'use client';

/**
 * Opening a project in this browser (`ProjectGate`): each half of it — the calculation (the
 * calculator and its drawing board) and the 3D design — is put into the project's own stores
 * (`store/projectScope`), from this browser's cache when that is current and from the server's
 * row otherwise (`lib/flow/projectSync`).
 *
 * The studio opens the calculation too, when the project has one: "see it in 3D" carries it
 * into the design, and the design's budget orders it with the design; it is only ever read
 * there. The calculator does not open the design — what its summary says about the design, and
 * orders of it, it reads off the row (`useProjectMeta().snapshot`) — so a design being edited
 * in another tab is never written over by a calculator merely looking at it.
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { picksFromCalculator } from '@/lib/design/fromCalculator';
import { migrateFinishPicks, withRoomFinishQuantities } from '@/lib/calculator/roomFinishes';
import { cacheIsCurrent, isDirty, markClean, markDirty, touch, type ProjectHalf } from '@/lib/flow/projectSync';
import { picksFromScene, type SavedProjectInput } from '@/lib/projects/saved';
import type { FloorPlan } from '@/lib/design/types';

export type Journey = ProjectHalf;

const hasRooms = (plan: FloorPlan | null | undefined): plan is FloorPlan => !!plan && plan.rooms.length > 0;

/** Where a half came from on this opening. */
export type LoadedFrom = 'cache' | 'server';

/**
 * The calculation's floor and wall picks in the catalogue step's shape — one per room and
 * surface, counted from the room (`lib/calculator/roomFinishes`). Picks from before every room
 * took its own (the cart laid on the board by hand; a finish for the whole flat) are moved
 * onto the rooms here, once. True when anything changed.
 */
function normalizeFinishPicks(id: number): boolean {
  const calc = useCalculatorStore.for(id);
  const { selectedProducts, rooms } = calc.getState();
  const next = withRoomFinishQuantities(migrateFinishPicks(selectedProducts, rooms, useCalculatorPlanStore.for(id).getState().finishes), rooms);
  if (next === selectedProducts) return false;
  calc.setState({ selectedProducts: next });
  return true;
}

/**
 * The calculation. A row the calculator has written opens as it was saved, drawing board
 * included; a project designed first opens the way "open in the calculator" always opened it —
 * the plan's rooms, the studio's products as the picks, the home state only when a renovation
 * chose one.
 */
export function loadCalculatorHalf(project: SavedProjectInput): LoadedFrom {
  const id = project.id;
  const calc = useCalculatorStore.for(id);
  const board = useCalculatorPlanStore.for(id);
  // A project designed first has no calculation of its own yet: what the calculator shows is
  // worked out from the design's row every time, unless this browser holds changes to it.
  const own = project.calculatorStarted || isDirty('calculator', id);
  if (own && cacheIsCurrent('calculator', id, calc.getState().baseRev, project.calculatorRev) && calc.getState().projectId === id && board.getState().projectId === id) {
    touch('calculator', id);
    // A copy from before every room took its own floor and walls: moved, and written.
    if (normalizeFinishPicks(id)) markDirty('calculator', id);
    return 'cache';
  }
  // A drawing this browser has of the same flat, when the row has none — a calculation from
  // before the board was saved: it is kept, and written, rather than rebuilt as rectangles.
  const cachedBoard = board.getState().plan;
  const rowRoomIds = new Set(project.rooms.map((r) => r.id));
  const rescue =
    !project.calculatorBoard?.plan &&
    !!cachedBoard &&
    cachedBoard.source !== 'calculator' &&
    cachedBoard.rooms.length > 0 &&
    cachedBoard.rooms.length === project.rooms.length &&
    cachedBoard.rooms.every((r) => rowRoomIds.has(r.id));
  let rescued = false;
  calc.getState().reset();
  if (project.calculatorStarted) {
    calc.getState().openSavedProject({
      projectId: id,
      rooms: project.rooms,
      homeState: project.homeState,
      selectedProducts: project.selectedProducts,
      selectedFurniture: project.selectedFurniture,
      edits: project.calculatorEdits,
      progress: project.calculatorProgress,
    });
    const saved = project.calculatorBoard;
    // The board as the calculator saved it; a calculation from before the board was saved
    // draws the design's plan when there is one (the same flat), and otherwise is rebuilt
    // from its rooms on the plan step (`useCalculatorPlan`).
    if (saved?.plan) board.getState().openBoard({ projectId: id, plan: saved.plan, floorPlanUrl: saved.floorPlanUrl, finishes: saved.finishes });
    else if (rescue) {
      board.getState().setProjectId(id);
      rescued = true;
    } else board.getState().openBoard({ projectId: id, plan: hasRooms(project.plan) ? project.plan : null, floorPlanUrl: saved?.floorPlanUrl ?? project.floorPlanUrl, finishes: [] });
  } else {
    // Designed first: the studio's products stand in for picks, so the calculator's steps show
    // what was chosen rather than nothing. A renovation + design chose its home state in the
    // studio, and the flat is the design's: the estimate is there to be read, from the
    // materials on. A design-only project never chose one, and starts on the first step.
    const picks = project.scene ? picksFromScene(project.scene) : { selectedProducts: {}, selectedFurniture: {} };
    // (A renovation not drawn yet has nothing to read: it starts on the first step too.)
    const renovation = project.hasCalculator && project.homeState != null && project.rooms.length > 0;
    calc.getState().openSavedProject({
      projectId: id,
      rooms: project.rooms,
      homeState: renovation ? project.homeState : null,
      ...picks,
      edits: null,
      progress: renovation ? { step: 3, calculated: true, at: 3 } : { step: 1, calculated: false, at: 1 },
    });
    // The calculator draws on its own board: the design's plan, and nothing of its furniture or finishes.
    board.getState().openBoard({ projectId: id, plan: hasRooms(project.plan) ? project.plan : null, floorPlanUrl: project.floorPlanUrl, finishes: [] });
  }
  // The copy is the row's, at the row's revision.
  calc.setState({ baseRev: project.calculatorRev });
  markClean('calculator', id);
  // Picks saved before every room took its own floor and walls are moved onto the rooms and
  // written back — the calculation's own; a project designed first only shows the studio's
  // products as picks, and opening it writes nothing.
  const moved = normalizeFinishPicks(id);
  if (rescued || (moved && project.calculatorStarted)) markDirty('calculator', id);
  return 'server';
}

/**
 * The 3D design, exactly as it was saved. A project with no design yet opens an empty studio
 * store; the entry page then carries the calculation into it (`handOffToDesign`) or step 1
 * starts one.
 */
export function loadDesignHalf(project: SavedProjectInput): LoadedFrom {
  const id = project.id;
  const design = useDesignStore.for(id);
  if (cacheIsCurrent('design', id, design.getState().baseRev, project.designRev) && design.getState().projectId === id) {
    // The calculation may have changed its picks since this copy was made: they are read off it again.
    if (design.getState().planFromCalculator && project.calculatorStarted) design.getState().setCalculatorPicks(calculatorPicksOf(id));
    touch('design', id);
    return 'cache';
  }
  const state = design.getState();
  state.reset();
  if (project.plan && project.scene) {
    state.openSaved({
      projectId: id,
      plan: project.plan,
      scene: { ...project.scene, progress: project.designProgress },
      floorPlanUrl: project.floorPlanUrl,
      homeState: project.homeState,
      versions: project.versions,
    });
    // A design carried in from the calculation applies the calculation's picks (to a layout
    // still to be generated, or when "see it in 3D" brings new ones). They are the calculator's
    // own, so they are read off it rather than stored twice.
    if (design.getState().planFromCalculator && project.calculatorStarted) design.getState().setCalculatorPicks(calculatorPicksOf(id));
  } else {
    design.getState().setProjectId(id);
  }
  // The copy is the row's, at the row's revision.
  design.setState({ baseRev: project.designRev });
  markClean('design', id);
  return 'server';
}

/** The project's calculator picks as the studio applies them. */
function calculatorPicksOf(id: number) {
  const calc = useCalculatorStore.for(id).getState();
  return picksFromCalculator(calc.selectedProducts, calc.selectedFurniture);
}

/** Opens a project's halves for `journey`: the calculator its own; the studio the calculation first (the design reads it), then its own. */
export function openProjectStores(journey: Journey, project: SavedProjectInput): { calculator: LoadedFrom | null; design: LoadedFrom | null } {
  const wantCalculator = journey === 'calculator' || project.calculatorStarted;
  const wantDesign = journey === 'design';
  const calculator = wantCalculator ? loadCalculatorHalf(project) : null;
  const design = wantDesign ? loadDesignHalf(project) : null;
  // The home's condition is the calculation's once there is one: the design prices against the
  // same one the server will (its save leaves the calculation's alone), whichever copy opened.
  if (wantDesign && project.calculatorStarted) {
    const owned = useCalculatorStore.for(project.id).getState().homeState ?? project.homeState;
    const studio = useDesignStore.for(project.id).getState();
    if (owned && studio.plan && studio.homeState !== owned) studio.setHomeState(owned);
  }
  return { calculator, design };
}

/** The calculation can be carried into 3D: it has a home state and rooms. */
export function calculatorReady(id: number): boolean {
  const calc = useCalculatorStore.for(id).getState();
  return calc.projectId === id && !!calc.homeState && calc.rooms.length > 0;
}

/**
 * "See it in 3D": the project's calculation into its design — its rooms (its drawing when it
 * has one), home state, choices and every pick. A design the project already has is kept and
 * the picks are put into it (`startFromCalculator`); an empty one is laid out from the
 * calculation on the style step. Returns where to go, or null when there is no calculation to
 * carry. The design is marked unsaved, so it is written straight away rather than taken for
 * what the server already has.
 */
export function handOffToDesign(id: number): 'studio' | 'style' | 'resume' | null {
  if (!calculatorReady(id)) return null;
  const calc = useCalculatorStore.for(id).getState();
  const board = useCalculatorPlanStore.for(id).getState();
  const landing = useDesignStore.for(id).getState().startFromCalculator({
    rooms: calc.rooms,
    homeState: calc.homeState!,
    selectedProducts: calc.selectedProducts,
    selectedFurniture: calc.selectedFurniture,
    projectId: id,
    plan: board.plan,
    floorPlanUrl: board.floorPlanUrl,
    choices: calc.choices,
  });
  markDirty('design', id);
  return landing;
}
