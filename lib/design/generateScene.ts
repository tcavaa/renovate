/**
 * Laying the flat out — the journey's hinge (docs/design-studio/overview.md#generation-versions-and-undo)
 * — as one pure function, so the browser's store (`designStore.generate`) and the server's
 * generation job (`lib/api/designJob`) lay a flat out the same way: the layout engine's slots, the
 * products matched to them (the AI designer's picks where they fit), every floor and wall in the
 * style's products (the designer's where it chose), the calculation's picks, the fittings, doors
 * and windows as products, the designer's wall decor, and the tidy-up once everything stands.
 * Isomorphic: no React, no `window`, no clock but the `at` it is handed.
 */

import { withoutOrphans } from './arrangedOff';
import { settleFitted } from './fitted';
import { fitKitchenCorners } from './kitchenCorner';
import { applyReviewFixes, clearOfDecor, proposalDecor, proposalNotes, proposalPicks, settleToWalls, standsAfterMove, underCeilingDecor, withoutArtOverDecor, withProposalFinishes, type AiProposal } from './aiProposal';
import type { AiReview } from './aiReview';
import { layoutPlan } from './autoLayout';
import { suggestElectrical, withFixtureProducts } from './electrical';
import { applyBoardPicks, applyFinishPicks, applyFurniturePicks, type CalculatorPicks } from './fromCalculator';
import { budgetLevel, matchProducts, type CatalogProduct } from './matcher';
import { fitBathrooms } from './bathroom';
import { fitHall } from './hall';
import { fitWardrobes } from './bedroom';
import { withOpeningProducts } from './openings';
import { rngStreams, roomStreams, type RoomRng, type Rng } from './random';
import { generatedFinish, isStyleFinish, withFlatFinish } from './surfaces';
import { technicalAnchors } from './technical';
import { hasTrims, styleTrim } from './trims';
import { columnFootprints } from './walls';
import { withGeneratedPartitions } from './autoPartitions';
import { radiatorKeepouts } from './ruleChecks';
import { radiatorBodies } from './radiators';
import { entranceSightBands, underCeiling, type Quad } from './rules';
import type { Footprint } from './manipulate';
import { isBaseFinish } from './zones';
import type { DecorPiece, ElectricalPoint, FloorPlan, GenerationRecord, PlacedItem, StyleId, SurfaceFinish } from './types';
import { wcBoxes } from './decor/wcBox';

export interface GenerateSceneInput {
  plan: FloorPlan;
  styleId: StyleId;
  budgetGel: number | null;
  catalog: CatalogProduct[];
  /** The AI designer's proposal; none (no key, a failure) is the engine's own flat. */
  proposal?: AiProposal | null;
  /** The finishes the flat has now: one somebody chose stays. */
  finishes: SurfaceFinish[];
  /** The fittings it has now: those placed by hand, and those generated, are kept (`suggestElectrical`). */
  electrical: ElectricalPoint[];
  /** The calculation's picks, for a flat carried in from the calculator. */
  calculatorPicks?: CalculatorPicks | null;
  /** The draw (`lib/design/random`): one seed is one flat. */
  seed: number;
  /** When it is generated (ISO). */
  at: string;
  /** The AI runs the design has had, this one included — capped per design (`MAX_AI_GENERATIONS`). */
  aiCount: number;
}

export interface GeneratedScene {
  /** The plan with its doors and windows as products (and the calculation's whole-flat picks on them). */
  plan: FloorPlan;
  items: PlacedItem[];
  finishes: SurfaceFinish[];
  decor: DecorPiece[];
  electrical: ElectricalPoint[];
  generation: GenerationRecord;
}

export function generateScene(input: GenerateSceneInput): GeneratedScene {
  const { styleId, budgetGel, catalog, proposal = null, calculatorPicks = null } = input;
  // The partitions the app adds (the entrance out of the living room's sight, an en-suite's lobby),
  // before anything is laid out round them; the floor behind each stays free.
  const partitioned = withGeneratedPartitions(input.plan, styleId);
  const plan = partitioned.plan;
  // Every generation draws from its own seed: the same plan gives another layout, other products
  // and other floors and walls each time. Each room draws each stage — its layout, its products,
  // its bathroom pass, its floor and walls — from a stream of its own (`roomStreams`), so a change
  // in one room (a piece more, a wall moved, a door added) leaves every other room's draw as it was.
  const streams = rngStreams(input.seed);
  // Columns are in the way, and so is the floor in front of a radiator: nothing is stood there.
  const radiators = radiatorKeepouts(plan);
  const obstacles = Object.fromEntries(plan.rooms.map((r) => [r.id, [...columnFootprints(plan, r.id), ...(radiators[r.id] ?? []), ...(partitioned.keepouts[r.id] ?? [])]]));
  // What is seen coming in through the front door: the kitchen keeps out of it where it can.
  const entranceSight: Record<string, Quad[]> = {};
  for (const band of entranceSightBands(plan.rooms)) (entranceSight[band.roomId] ??= []).push(band.quad);
  // Laid out under the ceiling: a pendant hangs from a new ceiling, a curtain runs from just under it.
  const underCeilings = plan.rooms.map((r) => underCeiling(r, plan));
  const placed = layoutPlan(underCeilings, { anchors: technicalAnchors(plan), obstacles, roomRng: roomStreams(streams, 'layout'), entranceSight, styleId });
  // A slot no partner product can fill is dropped rather than shown as a stand-in — and with it
  // what the engine arranged off it (`withoutOrphans`: no coffee table before a sofa that is not
  // there). The AI designer's product picks go in where they fit their slot (`MatchOptions.picks`).
  const matchOptions = { styleId, budgetGel, rooms: underCeilings, roomRng: roomStreams(streams, 'match'), picks: proposalPicks(proposal), keepClear: obstacles };
  let items = withoutOrphans(placed, placeableOnly(matchProducts(placed, catalog, matchOptions)), underCeilings);
  // The bathrooms finished as a joiner and a plumber would (the rulebook): a vanity made to measure
  // under the basin, a tap on it, the washer's column (a dryer on the machine at the top budget), the
  // bath boxed or enclosed and its mixer at its head.
  const fitted = fitBathrooms({ rooms: underCeilings, items, catalog, styleId, level: budgetLevel(placed, catalog, matchOptions), roomRng: roomStreams(streams, 'bathroom'), keepClear: obstacles, radiators: radiatorBodies(plan) });
  items = fitted.items;
  // The hall's built-in wardrobe by the front door (coats, the boiler's cupboard, shoes) and the
  // full-height mirror across from it.
  const hall = fitHall({ rooms: underCeilings, items, catalog, styleId, technical: plan.technical?.points ?? [], radiators: radiatorBodies(plan) });
  items = hall.items;
  // A bedroom's wall of wardrobe where the wardrobe's wall is otherwise empty (no chest besides).
  const wardrobes = fitWardrobes({ rooms: underCeilings, items, catalog, styleId, radiators: radiatorBodies(plan) });
  items = wardrobes.items;
  // A kitchen whose run is short of a kitchen turns the corner where the next wall is free (an
  // L-shaped kitchen): more of the same kitchen along the next wall, and its wall cabinets.
  items = fitKitchenCorners(underCeilings, items, [...fitted.decor, ...hall.decor, ...wardrobes.decor], radiators);
  // Every floor and wall is the style's product for its room — tiles in the bathroom, laminate
  // and paint elsewhere — so the budget buys what the flat is shown in. Re-laying out the
  // furniture is not a reason to lose the tiles someone picked. The designer's floors and walls
  // replace the style's own draw.
  let finishes = withFlatFinish(withProposalFinishes(keepChosen(defaultFinishes(plan, styleId, catalog, undefined, roomStreams(streams, 'finish')), input.finishes), plan, proposal, styleId, catalog), plan.rooms, catalog);
  if (calculatorPicks) {
    items = withoutOrphans(items, placeableOnly(applyFurniturePicks(items, plan, calculatorPicks, catalog, obstacles)), plan.rooms);
    finishes = applyFinishPicks(finishes, plan, calculatorPicks, catalog);
  }
  // The wiring follows the furniture; a room the person wired by hand — on this board or on the
  // calculation's — is kept whole. Points from before origins were recorded go, as they always
  // did. Every fitting is bought as a product where the catalogue has one — and so is every door
  // and window.
  const known = input.electrical.filter((p) => p.origin === 'user' || p.origin === 'generated');
  const rooms = withOpeningProducts(plan.rooms, catalog, styleId);
  const laid = rooms !== plan.rooms ? { ...plan, rooms } : plan;
  // A box behind every WC for its concealed cistern (the design rules), whoever designed the rest.
  const boxes = wcBoxes(laid.rooms, items, catalog);
  // The designer's wall decor, measured against where the engine put the bed, the sofa, the TV
  // unit, and kept off the joinery and the boxes it built (`proposalDecor`). An engine generation has none.
  const designed = proposalDecor(laid, proposal, items, catalog, [...fitted.decor, ...hall.decor, ...wardrobes.decor, ...boxes]);
  const decor = [...designed, ...fitted.decor, ...hall.decor, ...wardrobes.decor, ...boxes];
  // Wired once the joinery and the decor stand, so no switch or general socket lands behind a
  // wardrobe (`standardFor`).
  const wired = withFixtureProducts(suggestElectrical(plan, items, known, styleId, decor), catalog, styleId, plan.rooms, items);
  // A door, a window, a radiator, a socket or a light the calculation chose for the whole flat
  // stays its choice — the catalogue's product, from its shop.
  const dressed = calculatorPicks ? applyBoardPicks(laid, wired, calculatorPicks, catalog) : { plan: laid, electrical: wired };
  // Tidied once everything stands: every wall piece back on its wall, nothing in the decor, the
  // hanging lamps and ceiling points under a lowered ceiling hung from it.
  items = clearOfDecor(settleToWalls(withoutArtOverDecor(items, decor, laid), laid), decor, laid);
  const ceiled = underCeilingDecor(items, dressed.electrical, decor, laid);
  const generation: GenerationRecord = proposal
    ? { by: 'ai', model: proposal.model, at: input.at, notes: proposalNotes(proposal), aiCount: input.aiCount, seed: input.seed }
    : { by: 'engine', at: input.at, aiCount: input.aiCount, seed: input.seed };
  return { plan: dressed.plan, items: ceiled.items, finishes, decor, electrical: ceiled.electrical, generation };
}

/**
 * The designer's check applied to the flat it furnished (`lib/design/aiReview`): its
 * replacements, removals and moves where they fit (`applyReviewFixes`), and each room's note
 * after the check said after the first. In a room the check changed, the fittings follow the
 * furniture again as they do when the flat is laid out (`suggestElectrical`, `withFixtureProducts`,
 * the calculation's choices, `underCeilingDecor`) — a room wired by hand is kept — and every other
 * room keeps its fittings as they were.
 */
export function reviewedScene(
  scene: { plan: FloorPlan; items: PlacedItem[]; decor: DecorPiece[]; electrical: ElectricalPoint[]; generation: GenerationRecord; styleId: StyleId; calculatorPicks?: CalculatorPicks | null },
  review: AiReview,
  catalog: CatalogProduct[]
): { items: PlacedItem[]; decor: DecorPiece[]; electrical: ElectricalPoint[]; generation: GenerationRecord } {
  // A piece the check moves keeps off the floor the layout kept clear, as the matcher's products do.
  const clear = keptClear(scene.plan, scene.styleId);
  const checked = (fixes: AiReview['fixes']) => {
    const reviewed = applyReviewFixes(scene.items, scene.decor, { ...review, fixes }, scene.plan, catalog, clear);
    // What was arranged off a piece the check took away goes with it (the TV with its unit), and so
    // does what was built for a piece it moved or took away (`lib/design/fitted`).
    const standing = withoutOrphans(scene.items, placeableOnly(reviewed.items), scene.plan.rooms);
    // Only what was built for a piece the check moved, replaced or took out is settled again: the
    // rest stays as generation built it (the studio's builders would redo it by other formulas).
    return settleFitted(reviewed.decor, standing, scene.plan.rooms, changedPieces(scene.items, standing));
  };
  // A move is kept only where the piece stands well once what was built for it is settled behind
  // it (a WC pushed off its new wall by its box into the basin): a move that does not is dropped.
  let fixes = review.fixes;
  let fixed = checked(fixes);
  for (;;) {
    const now = fixed;
    const before = new Map(scene.items.map((i) => [i.id, i]));
    const badly = fixes.filter((fix) => {
      if (fix.action !== 'to_wall' && fix.action !== 'move_to_wall') return false;
      const was = before.get(fix.target);
      const is = now.items.find((i) => i.id === fix.target);
      if (!was || !is || JSON.stringify(is) === JSON.stringify(was)) return false;
      return !standsAfterMove(is, now.items, now.decor, scene.plan, clear[is.roomId]);
    });
    if (badly.length === 0) break;
    fixes = fixes.filter((fix) => !badly.includes(fix));
    fixed = checked(fixes);
  }
  let items = placeableOnly(fixed.items);
  // What the check did, as it is kept (`generation.reviewed`): the fixes kept that change the flat
  // each on its own — not those it asked for that changed nothing (a piece not there, a product
  // that does not fit, a piece already against its wall, a move that did not stand), nor a piece
  // that only followed another's fix (the nightstands of a moved bed).
  const applied = fixes.filter((fix) => {
    const alone = applyReviewFixes(scene.items, scene.decor, { ...review, fixes: [fix] }, scene.plan, catalog, clear);
    return changedPieces(scene.items, alone.items).size > 0 || JSON.stringify(alone.decor) !== JSON.stringify(scene.decor);
  }).length;
  let electrical = scene.electrical;
  const rewire = changedRooms(scene, { items, decor: fixed.decor });
  if (rewire.size > 0) {
    const wired = withFixtureProducts(suggestElectrical(scene.plan, items, scene.electrical, scene.styleId, fixed.decor), catalog, scene.styleId, scene.plan.rooms, items);
    const dressed = scene.calculatorPicks ? applyBoardPicks(scene.plan, wired, scene.calculatorPicks, catalog).electrical : wired;
    const points = [...scene.electrical.filter((p) => !rewire.has(p.roomId)), ...dressed.filter((p) => rewire.has(p.roomId))];
    const ceiled = underCeilingDecor(items, points, fixed.decor, scene.plan);
    items = ceiled.items;
    electrical = ceiled.electrical;
  }
  // The room's note after the check says how it reads now; the designer's first note stays before it.
  const notes = { ...(scene.generation.notes ?? {}) };
  for (const [roomId, note] of Object.entries(review.notes)) notes[roomId] = (notes[roomId] ? `${notes[roomId]} ${note}` : note).slice(0, 1200);
  return { items, decor: fixed.decor, electrical, generation: { ...scene.generation, notes, reviewed: applied } };
}

/** The ids of the pieces not as they were: moved, swapped, gone or new. */
function changedPieces(before: readonly PlacedItem[], after: readonly PlacedItem[]): Set<string> {
  const now = new Map(after.map((i) => [i.id, i]));
  const ids = new Set(before.map((i) => i.id));
  const changed = new Set<string>();
  for (const was of before) {
    const is = now.get(was.id);
    if (!is || (is !== was && JSON.stringify(is) !== JSON.stringify(was))) changed.add(was.id);
  }
  for (const is of after) if (!ids.has(is.id)) changed.add(is.id);
  return changed;
}

/** The rooms whose furniture or decor is not as it was: a piece added, gone, moved, swapped or rebuilt. */
function changedRooms(before: { items: PlacedItem[]; decor: DecorPiece[] }, after: { items: PlacedItem[]; decor: DecorPiece[] }): Set<string> {
  const rooms = new Set<string>();
  const compare = (was: ReadonlyArray<{ id: string; roomId: string }>, now: ReadonlyArray<{ id: string; roomId: string }>) => {
    const nowById = new Map(now.map((x) => [x.id, x]));
    const wasIds = new Set(was.map((x) => x.id));
    for (const x of was) {
      const y = nowById.get(x.id);
      if (!y) rooms.add(x.roomId);
      else if (y !== x && JSON.stringify(y) !== JSON.stringify(x)) rooms.add(x.roomId).add(y.roomId);
    }
    for (const y of now) if (!wasIds.has(y.id)) rooms.add(y.roomId);
  };
  compare(before.items, after.items);
  compare(before.decor, after.decor);
  return rooms;
}

/**
 * The floor a flat's layout keeps clear, per room: its columns, the strip before each radiator and
 * the floor behind a partition screen that stands (`withGeneratedPartitions` on a plan that has its
 * screens adds none and keeps their floor) — what `generateScene` hands the layout and the matcher.
 */
function keptClear(plan: FloorPlan, styleId: StyleId | null): Record<string, Footprint[]> {
  const radiators = radiatorKeepouts(plan);
  const partitions = withGeneratedPartitions(plan, styleId);
  const behind = partitions.added.length === 0 ? partitions.keepouts : {};
  return Object.fromEntries(plan.rooms.map((r) => [r.id, [...columnFootprints(plan, r.id), ...(radiators[r.id] ?? []), ...(behind[r.id] ?? [])]]));
}

/**
 * Keeps only the items that ended up with a real partner model behind them. What was arranged off
 * one that did not goes too: `withoutOrphans` (`lib/design/arrangedOff`), wherever generation drops
 * pieces — after matching, after the calculation's picks, after the designer's check.
 */
export function placeableOnly(items: PlacedItem[]): PlacedItem[] {
  return items.filter((item) => !!item.product?.model3dUrl);
}

/**
 * Every room's floor, walls, ceiling and mouldings as the style lays them: its floor and walls as
 * the partner products they are when the catalogue is to hand (`generatedFinish`, drawn from the
 * style's kind of finish when generating — `rng`, or each room from its own stream, `roomRng`), its
 * ceiling and mouldings as the style's look.
 * Without a catalogue the floor and walls are the look alone, until one comes
 * (`ensureFinishProducts`).
 */
export function defaultFinishes(plan: FloorPlan | null, styleId: StyleId, catalog: CatalogProduct[] = [], rng?: Rng, roomRng?: RoomRng): SurfaceFinish[] {
  if (!plan) return [];
  const surfaces = ['floor', 'wall', 'ceiling'] as const;
  const finishes = plan.rooms.flatMap((room) => {
    // The room's own draw, where generation hands one per room (`roomRng`).
    const draw = roomRng ? roomRng(room.id) : rng;
    return [...surfaces.map((surface) => generatedFinish(room, surface, styleId, catalog, draw)), ...(hasTrims(room) ? [styleTrim(room, 'skirting', styleId, catalog), styleTrim(room, 'cornice', styleId, catalog)] : [])];
  });
  // One floor and one wall finish through the flat, drawn for its main room (the owner's notes):
  // a bathroom, a balcony and a closed kitchen keep their own.
  return withFlatFinish(finishes, plan.rooms, catalog);
}

/**
 * Defaults, except where a room already has a finish somebody chose; single walls and zones
 * ride along. The style's own product is kept too, unless the defaults could look the style
 * up again — a new layout, with the catalogue to hand, lays the style's product for each room
 * as it is now; an edit to the plan has no catalogue, and keeps what the style had laid. A
 * floor two products share (the calculation's split, `SurfaceFinish.share`) is kept whole —
 * every part of it, not only the first.
 */
export function keepChosen(defaults: SurfaceFinish[], current: SurfaceFinish[]): SurfaceFinish[] {
  const base = defaults.flatMap((d) => {
    const kept = current.filter((c) => c.roomId === d.roomId && c.surface === d.surface && isBaseFinish(c) && c.product);
    const chosen = kept.filter((c) => !isStyleFinish(c));
    if (chosen.length > 0) return chosen;
    return kept.length === 0 || d.product ? [d] : kept.slice(0, 1);
  });
  const extras = current.filter((c) => !isBaseFinish(c) && defaults.some((d) => d.roomId === c.roomId));
  return [...base, ...extras];
}
