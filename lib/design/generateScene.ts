/**
 * Laying the flat out — the journey's hinge (docs/design-studio/overview.md#generation-versions-and-undo)
 * — as one pure function, so the browser's store (`designStore.generate`) and the server's
 * generation job (`lib/api/designJob`) lay a flat out the same way: the layout engine's slots, the
 * products matched to them (the AI designer's picks where they fit), every floor and wall in the
 * style's products (the designer's where it chose), the calculation's picks, the fittings, doors
 * and windows as products, the designer's wall decor, and the tidy-up once everything stands.
 * Isomorphic: no React, no `window`, no clock but the `at` it is handed.
 */

import { applyReviewFixes, clearOfDecor, proposalDecor, proposalNotes, proposalPicks, settleToWalls, underCeilingDecor, withoutArtOverDecor, withProposalFinishes, type AiProposal } from './aiProposal';
import type { AiReview } from './aiReview';
import { layoutPlan } from './autoLayout';
import { suggestElectrical, withFixtureProducts } from './electrical';
import { applyBoardPicks, applyFinishPicks, applyFurniturePicks, type CalculatorPicks } from './fromCalculator';
import { matchProducts, type CatalogProduct } from './matcher';
import { withOpeningProducts } from './openings';
import { seededRng, type Rng } from './random';
import { generatedFinish, isStyleFinish } from './surfaces';
import { technicalAnchors } from './technical';
import { defaultTrim, hasTrims } from './trims';
import { columnFootprints } from './walls';
import { radiatorKeepouts } from './ruleChecks';
import { entranceSightBands, type Quad } from './rules';
import { isBaseFinish } from './zones';
import type { DecorPiece, ElectricalPoint, FloorPlan, GenerationRecord, PlacedItem, StyleId, SurfaceFinish } from './types';

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
  const { plan, styleId, budgetGel, catalog, proposal = null, calculatorPicks = null } = input;
  // Every generation draws from its own seed: the same plan gives another layout, other products
  // and other floors and walls each time.
  const rng = seededRng(input.seed);
  // Columns are in the way, and so is the floor in front of a radiator: nothing is stood there.
  const radiators = radiatorKeepouts(plan);
  const obstacles = Object.fromEntries(plan.rooms.map((r) => [r.id, [...columnFootprints(plan, r.id), ...(radiators[r.id] ?? [])]]));
  // What is seen coming in through the front door: the kitchen keeps out of it where it can.
  const entranceSight: Record<string, Quad[]> = {};
  for (const band of entranceSightBands(plan.rooms)) (entranceSight[band.roomId] ??= []).push(band.quad);
  const placed = layoutPlan(plan.rooms, { anchors: technicalAnchors(plan), obstacles, rng, entranceSight });
  // A slot no partner product can fill is dropped rather than shown as a stand-in. The AI
  // designer's product picks go in where they fit their slot (`MatchOptions.picks`).
  let items = placeableOnly(matchProducts(placed, catalog, { styleId, budgetGel, rooms: plan.rooms, rng, picks: proposalPicks(proposal) }));
  // Every floor and wall is the style's product for its room — tiles in the bathroom, laminate
  // and paint elsewhere — so the budget buys what the flat is shown in. Re-laying out the
  // furniture is not a reason to lose the tiles someone picked. The designer's floors and walls
  // replace the style's own draw.
  let finishes = withProposalFinishes(keepChosen(defaultFinishes(plan, styleId, catalog, rng), input.finishes), plan, proposal, styleId, catalog);
  if (calculatorPicks) {
    items = placeableOnly(applyFurniturePicks(items, plan, calculatorPicks, catalog));
    finishes = applyFinishPicks(finishes, plan, calculatorPicks, catalog);
  }
  // The wiring follows the furniture; a room the person wired by hand — on this board or on the
  // calculation's — is kept whole. Points from before origins were recorded go, as they always
  // did. Every fitting is bought as a product where the catalogue has one — and so is every door
  // and window.
  const known = input.electrical.filter((p) => p.origin === 'user' || p.origin === 'generated');
  const wired = withFixtureProducts(suggestElectrical(plan, items, known), catalog, styleId);
  const rooms = withOpeningProducts(plan.rooms, catalog, styleId);
  const laid = rooms !== plan.rooms ? { ...plan, rooms } : plan;
  // A door, a window, a radiator, a socket or a light the calculation chose for the whole flat
  // stays its choice — the catalogue's product, from its shop.
  const dressed = calculatorPicks ? applyBoardPicks(laid, wired, calculatorPicks, catalog) : { plan: laid, electrical: wired };
  // The designer's wall decor, measured against where the engine put the bed, the sofa, the TV
  // unit (`proposalDecor`). An engine generation has none.
  const decor = proposalDecor(laid, proposal, items, catalog);
  // Tidied once everything stands: every wall piece back on its wall, nothing in the decor, the
  // hanging lamps and ceiling points under a lowered ceiling hung from it.
  items = clearOfDecor(settleToWalls(withoutArtOverDecor(items, decor, laid), laid), decor, laid);
  const ceiled = underCeilingDecor(items, dressed.electrical, decor, laid);
  const generation: GenerationRecord = proposal
    ? { by: 'ai', model: proposal.model, at: input.at, notes: proposalNotes(proposal), aiCount: input.aiCount }
    : { by: 'engine', at: input.at, aiCount: input.aiCount };
  return { plan: dressed.plan, items: ceiled.items, finishes, decor, electrical: ceiled.electrical, generation };
}

/**
 * The designer's check applied to the flat it furnished (`lib/design/aiReview`): its
 * replacements, removals and moves where they fit (`applyReviewFixes`), and each room's note
 * after the check said after the first.
 */
export function reviewedScene(
  scene: { plan: FloorPlan; items: PlacedItem[]; decor: DecorPiece[]; generation: GenerationRecord },
  review: AiReview,
  catalog: CatalogProduct[]
): { items: PlacedItem[]; decor: DecorPiece[]; generation: GenerationRecord } {
  const fixed = applyReviewFixes(scene.items, scene.decor, review, scene.plan, catalog);
  // The room's note after the check says how it reads now; the designer's first note stays before it.
  const notes = { ...(scene.generation.notes ?? {}) };
  for (const [roomId, note] of Object.entries(review.notes)) notes[roomId] = (notes[roomId] ? `${notes[roomId]} ${note}` : note).slice(0, 1200);
  return { items: placeableOnly(fixed.items), decor: fixed.decor, generation: { ...scene.generation, notes, reviewed: review.fixes.length } };
}

/** Keeps only the items that ended up with a real partner model behind them. */
export function placeableOnly(items: PlacedItem[]): PlacedItem[] {
  return items.filter((item) => !!item.product?.model3dUrl);
}

/**
 * Every room's floor, walls, ceiling and mouldings as the style lays them: its floor and walls as
 * the partner products they are when the catalogue is to hand (`generatedFinish`, drawn from the
 * style's kind of finish when generating — `rng`), its ceiling and mouldings as the style's look.
 * Without a catalogue the floor and walls are the look alone, until one comes
 * (`ensureFinishProducts`).
 */
export function defaultFinishes(plan: FloorPlan | null, styleId: StyleId, catalog: CatalogProduct[] = [], rng?: Rng): SurfaceFinish[] {
  if (!plan) return [];
  const surfaces = ['floor', 'wall', 'ceiling'] as const;
  return plan.rooms.flatMap((room) => [...surfaces.map((surface) => generatedFinish(room, surface, styleId, catalog, rng)), ...(hasTrims(room) ? [defaultTrim(room, 'skirting', styleId), defaultTrim(room, 'cornice', styleId)] : [])]);
}

/**
 * Defaults, except where a room already has a finish somebody chose; single walls and zones
 * ride along. The style's own product is kept too, unless the defaults could look the style
 * up again — a new layout, with the catalogue to hand, lays the style's product for each room
 * as it is now; an edit to the plan has no catalogue, and keeps what the style had laid.
 */
export function keepChosen(defaults: SurfaceFinish[], current: SurfaceFinish[]): SurfaceFinish[] {
  const base = defaults.map((d) => {
    const kept = current.find((c) => c.roomId === d.roomId && c.surface === d.surface && isBaseFinish(c) && c.product);
    return !kept || (isStyleFinish(kept) && d.product) ? d : kept;
  });
  const extras = current.filter((c) => !isBaseFinish(c) && defaults.some((d) => d.roomId === c.roomId));
  return [...base, ...extras];
}
