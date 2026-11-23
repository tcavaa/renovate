/**
 * Laying the flat out — the journey's hinge (docs/design-studio/overview.md#generation-versions-and-undo)
 * — as one pure function, so the browser's store (`designStore.generate`) and the server's
 * generation job (`lib/api/designJob`) lay a flat out the same way: the layout engine's slots, the
 * products matched to them (the AI designer's picks where they fit), every floor and wall in the
 * style's products (the designer's where it chose), the calculation's picks, the fittings, doors
 * and windows as products, the designer's wall decor, and the tidy-up once everything stands.
 * Isomorphic: no React, no `window`, no clock but the `at` it is handed.
 */

import { withoutOrphans } from './relations';
import { settleFitted } from './fitted';
import { fitKitchenCorners } from './kitchenCorner';
import { applyReviewFixes, clearOfDecor, proposalDecor, proposalNotes, proposalPicks, settleToWalls, standsAfterMove, underCeilingDecor, withoutArtOverDecor, withProposalFinishes, type AiProposal } from './aiProposal';
import type { AiReview } from './aiReview';
import { layoutPlan } from './autoLayout';
import { hangPendants } from './ceilingLights';
import { suggestElectrical, withFixtureProducts } from './electrical';
import { applyBoardPicks, applyFinishPicks, placeFurniturePicks, type CalculatorPicks } from './fromCalculator';
import { unplacedPicksOf, type PickOutcome } from './pickFit';
import { budgetLevel, matchProducts, type BudgetLevel, type CatalogProduct, type MatchOptions } from './matcher';
import { fitBathrooms } from './bathroom';
import { fitHall } from './hall';
import { withHousedBoiler } from './boilerCabinet';
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
import type { Footprint, KeepClear } from './manipulate';
import { isBaseFinish } from './zones';
import type { DecorPiece, ElectricalPoint, FloorPlan, GenerationRecord, PlacedItem, PlanRoom, StyleId, SurfaceFinish } from './types';
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
  /** What became of each of the calculation's picks (`placeFurniturePicks`); empty without picks. Not stored: the generation record keeps those left out. */
  picks?: PickOutcome[];
}

/**
 * The flat laid out and furnished before anything is finished, decorated or wired: the slots the
 * layout engine laid (`placed`), the products matched to them — the AI designer's picks where they
 * fit — with what the bathroom, hall and bedroom passes built round them and the kitchen turned
 * round its corner (`items`), the calculation's furniture picks applied, and the joinery and boxes
 * built (`built`: the hall's wardrobe, a wall of wardrobe, a vanity, a column, a bath's box, the
 * WC's box). What `generateScene` lays its finishes, decor and fittings over — and, with no
 * proposal, the engine's flat the AI designer is briefed from (`buildBrief`): the layout does not
 * depend on the designer's answer, so the slots it names are the slots the flat will have.
 */
export interface LaidOutFlat {
  /** The plan with the partitions the app adds. */
  plan: FloorPlan;
  /** That plan with its doors and windows as products. */
  laid: FloorPlan;
  /** The rooms as laid out: under the ceiling (`underCeiling`). */
  rooms: PlanRoom[];
  /** The slots as the layout engine laid them, at the archetypes' sizes, before any product. */
  placed: PlacedItem[];
  /** The slots as the matcher filled them, before the passes built round them (in `placed`'s order). */
  matched: PlacedItem[];
  /** The pieces as matched and fitted: what stands in the flat before the decor and the tidy-up. */
  items: PlacedItem[];
  /** The joinery and the boxes built (cabinets, then the WC's boxes). */
  built: DecorPiece[];
  /** The budget level the flat is matched at (`budgetLevel`). */
  level: BudgetLevel;
  /** The floor kept clear it was laid out with, per room. */
  kept: Record<string, KeepClear[]>;
  /** What became of each of the calculation's furniture picks (`placeFurniturePicks`, Nini's decision 13). */
  picks?: PickOutcome[];
}

export function layOutFlat(input: Pick<GenerateSceneInput, 'plan' | 'styleId' | 'budgetGel' | 'catalog' | 'proposal' | 'calculatorPicks' | 'seed'>): LaidOutFlat {
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
  // A slot no partner product can fill is dropped rather than shown as a stand-in — and with it
  // what the engine arranged off it (`withoutOrphans`: no coffee table before a sofa that is not
  // there). The AI designer's product picks go in where they fit their slot (`MatchOptions.picks`).
  const { placed, matchOptions, items: matched, kept } = laidOutAndMatched(obstacles, (clear) => {
    // Each try draws afresh from the seed's own streams (`layout`, `match`): the one kept is the flat's draw.
    const draws = rngStreams(input.seed);
    const laid = layoutPlan(underCeilings, { anchors: technicalAnchors(plan), obstacles: clear, roomRng: roomStreams(draws, 'layout'), entranceSight, styleId });
    const options = { styleId, budgetGel, rooms: underCeilings, roomRng: roomStreams(draws, 'match'), picks: proposalPicks(proposal), keepClear: clear };
    return { kept: clear, placed: laid, matchOptions: options, items: withoutOrphans(laid, placeableOnly(matchProducts(laid, catalog, options)), underCeilings) };
  });
  let items = matched;
  const level = budgetLevel(placed, catalog, matchOptions);
  // The bathrooms finished as a joiner and a plumber would (the rulebook): a vanity made to measure
  // under the basin, a tap on it, the washer's column (a dryer on the machine at the top budget), the
  // bath boxed or enclosed and its mixer at its head.
  const fitted = fitBathrooms({ rooms: underCeilings, items, catalog, styleId, level, roomRng: roomStreams(streams, 'bathroom'), keepClear: kept, radiators: radiatorBodies(plan) });
  items = fitted.items;
  // The hall's built-in wardrobe by the front door (coats, the boiler's section, shoes) and the
  // full-height mirror across from it. A boiler its section takes in has no cabinet of its own.
  const hall = fitHall({ rooms: underCeilings, items, catalog, styleId, technical: plan.technical?.points ?? [], radiators: radiatorBodies(plan) });
  items = hall.items;
  const housed = withHousedBoiler(plan, hall.housed, catalog, styleId);
  // A bedroom's wall of wardrobe where the wardrobe's wall is otherwise empty (no chest besides).
  const wardrobes = fitWardrobes({ rooms: underCeilings, items, catalog, styleId, radiators: radiatorBodies(plan) });
  items = wardrobes.items;
  // A kitchen whose run is short of a kitchen turns the corner where the next wall is free (an
  // L-shaped kitchen): more of the same kitchen along the next wall, and its wall cabinets.
  items = fitKitchenCorners(underCeilings, items, [...fitted.decor, ...hall.decor, ...wardrobes.decor], radiators);
  // The calculation's furniture: each pick in its room, else moved or turned there, else with the
  // room's secondary pieces making way, else in another room of its type, else left out of the 3D
  // (Nini's decision 13) — clear of the joinery built so far.
  let picks: PickOutcome[] = [];
  if (calculatorPicks) {
    const picked = placeFurniturePicks(items, plan, calculatorPicks, catalog, { keepClear: kept, built: [...fitted.decor, ...hall.decor, ...wardrobes.decor] });
    items = withoutOrphans(items, placeableOnly(picked.items), plan.rooms);
    picks = standingOutcomes(picked.outcomes, items);
  }
  // The pendants as matched, over what they light as it now stands: one large lamp, or two or three
  // small ones down a long table or island (Nini, decision 10b) — the AI designer's lamp too.
  items = hangPendants(items, underCeilings);
  // Every door and window is bought as a product where the catalogue has one.
  const rooms = withOpeningProducts(housed.rooms, catalog, styleId);
  const laid = rooms !== housed.rooms ? { ...housed, rooms } : housed;
  // A box behind every WC for its concealed cistern (the design rules), whoever designed the rest.
  const boxes = wcBoxes(laid.rooms, items, catalog);
  return { plan: housed, laid, rooms: underCeilings, placed, matched, items, built: [...fitted.decor, ...hall.decor, ...wardrobes.decor, ...boxes], level, kept, picks };
}

/** The picks' outcomes as the flat stands: one whose piece went after all (what it stood off taken away) is one left out. */
function standingOutcomes(outcomes: PickOutcome[], items: readonly PlacedItem[]): PickOutcome[] {
  const ids = new Set(items.map((item) => item.id));
  return outcomes.map((outcome) => (outcome.itemId && !ids.has(outcome.itemId) ? { ...outcome, step: 'unplaced', itemId: null, placedIn: null } : outcome));
}

export function generateScene(input: GenerateSceneInput): GeneratedScene {
  const { styleId, catalog, proposal = null, calculatorPicks = null } = input;
  const { plan, laid, items: furnished, built, picks = [] } = layOutFlat(input);
  let items = furnished;
  const streams = rngStreams(input.seed);
  // Every floor and wall is the style's product for its room — tiles in the bathroom, laminate
  // and paint elsewhere — so the budget buys what the flat is shown in. Re-laying out the
  // furniture is not a reason to lose the tiles someone picked. The designer's floors and walls
  // replace the style's own draw.
  let finishes = withFlatFinish(withProposalFinishes(keepChosen(defaultFinishes(plan, styleId, catalog, undefined, roomStreams(streams, 'finish')), input.finishes), plan, proposal, styleId, catalog), plan.rooms, catalog);
  if (calculatorPicks) finishes = applyFinishPicks(finishes, plan, calculatorPicks, catalog);
  // The wiring follows the furniture; a room the person wired by hand — on this board or on the
  // calculation's — is kept whole. Points from before origins were recorded go, as they always
  // did. Every fitting is bought as a product where the catalogue has one.
  const known = input.electrical.filter((p) => p.origin === 'user' || p.origin === 'generated');
  // The designer's wall decor, measured against where the engine put the bed, the sofa, the TV
  // unit, and kept off the joinery and the boxes it built (`proposalDecor`). An engine generation has none.
  const designed = proposalDecor(laid, proposal, items, catalog, built);
  const decor = [...designed, ...built];
  // Wired once the joinery and the decor stand, so no switch or general socket lands behind a
  // wardrobe (`standardFor`).
  const wired = withFixtureProducts(suggestElectrical(plan, items, known, styleId, decor), catalog, styleId, plan.rooms, items);
  // A door, a window, a radiator, a socket or a light the calculation chose for the whole flat
  // stays its choice — the catalogue's product, from its shop.
  const dressed = calculatorPicks ? applyBoardPicks(laid, wired, calculatorPicks, catalog) : { plan: laid, electrical: wired };
  // Tidied once everything stands: every wall piece back on its wall, nothing in the decor, the
  // hanging lamps and ceiling points under a lowered ceiling hung from it. A calculation's pick stays
  // where it was found to fit (`placeFurniturePicks`): pushed to a wall, it went into the joinery there.
  const tidied = clearOfDecor(settleToWalls(withoutArtOverDecor(items, decor, laid), laid, (item) => item.origin !== 'calculator'), decor, laid);
  // A table the tidy-up moved (a coffee table with its sofa back to the wall) takes its lamp with
  // it, and that room is wired again round the lamp where it now hangs.
  items = hangPendants(tidied, plan.rooms);
  const lampsMoved = new Set(items.filter((i) => i.slot === 'pendant' && !tidied.some((t) => t.id === i.id && t.position.x === i.position.x && t.position.z === i.position.z)).map((i) => i.roomId));
  if (lampsMoved.size > 0) {
    const rewired = withFixtureProducts(suggestElectrical(plan, items, known, styleId, decor), catalog, styleId, plan.rooms, items);
    const again = calculatorPicks ? applyBoardPicks(laid, rewired, calculatorPicks, catalog).electrical : rewired;
    dressed.electrical = [...dressed.electrical.filter((p) => !lampsMoved.has(p.roomId)), ...again.filter((p) => lampsMoved.has(p.roomId))];
  }
  const ceiled = underCeilingDecor(items, dressed.electrical, decor, laid);
  const unplacedPicks = unplacedPicksOf(picks);
  const generation: GenerationRecord = proposal
    ? { by: 'ai', model: proposal.model, at: input.at, notes: proposalNotes(proposal), aiCount: input.aiCount, seed: input.seed, ...(unplacedPicks ? { unplacedPicks } : {}) }
    : { by: 'engine', at: input.at, aiCount: input.aiCount, seed: input.seed, ...(unplacedPicks ? { unplacedPicks } : {}) };
  return { plan: dressed.plan, items: ceiled.items, finishes, decor, electrical: ceiled.electrical, generation, picks };
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
  // The pendants hung again over what they light, where the check moved a table or swapped a lamp.
  let items = hangPendants(placeableOnly(fixed.items), scene.plan.rooms);
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
export function keptClear(plan: FloorPlan, styleId: StyleId | null): Record<string, Footprint[]> {
  const radiators = radiatorKeepouts(plan);
  const partitions = withGeneratedPartitions(plan, styleId);
  const behind = partitions.added.length === 0 ? partitions.keepouts : {};
  return Object.fromEntries(plan.rooms.map((r) => [r.id, [...columnFootprints(plan, r.id), ...(radiators[r.id] ?? []), ...(behind[r.id] ?? [])]]));
}

/** The flat laid out and its products matched (`layoutPlan`, `matchProducts`, `withoutOrphans`). */
interface LaidOut {
  /** The floor kept clear it was laid out with, per room — what the later passes keep clear too. */
  kept: Record<string, KeepClear[]>;
  placed: PlacedItem[];
  matchOptions: MatchOptions;
  items: PlacedItem[];
}

/**
 * The flat laid out and matched (`run`) with the floor kept clear as given: the floor under a towel
 * rail hung low free for what stays lower than the rail (`KeepClear.bottom`) — a bath or a stool
 * laid under it. A room laid out another way for that may not lose a piece it has with that floor
 * kept clear to the ceiling, as it was: the slot laid under the rail can get no product that fits
 * (a bath of the style wider than its slot, laid against the basin), the room's other pieces
 * another way round can lose one (its mirror). Such a room is laid out and matched with its strips
 * clear from the floor up; every other room keeps the floor under its rail.
 */
function laidOutAndMatched(obstacles: Record<string, KeepClear[]>, run: (kept: Record<string, KeepClear[]>) => LaidOut): LaidOut {
  const under = run(obstacles);
  const low = Object.keys(obstacles).filter((id) => obstacles[id].some((box) => box.bottom != null));
  if (low.length === 0) return under;
  const toCeiling = (ids: string[]) =>
    Object.fromEntries(Object.entries(obstacles).map(([id, boxes]) => [id, ids.includes(id) ? boxes.map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ })) : boxes]));
  const clear = run(toCeiling(low));
  const losing = low.filter((id) => losesPiece(under.items, clear.items, id));
  if (losing.length === 0) return under;
  return losing.length === low.length ? clear : run(toCeiling(losing));
}

/** Whether a room has fewer pieces of a slot in `items` than in `before` (pieces with a product). */
function losesPiece(items: PlacedItem[], before: PlacedItem[], roomId: string): boolean {
  const count = (list: PlacedItem[]) => {
    const bySlot = new Map<string, number>();
    for (const item of list) if (item.roomId === roomId && item.product) bySlot.set(item.slot, (bySlot.get(item.slot) ?? 0) + 1);
    return bySlot;
  };
  const now = count(items);
  return [...count(before)].some(([slot, n]) => (now.get(slot) ?? 0) < n);
}

/**
 * Keeps only the items that ended up with a real partner model behind them. What was arranged off
 * one that did not goes too: `withoutOrphans` (`lib/design/relations`), wherever generation drops
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
