/**
 * Central-heating radiators: how many sections a room needs, and what each radiator is.
 *
 * A radiator is sold by the section (a panel radiator by the 10 cm module), so the two
 * questions the plan has to answer are *how much heat does this room want* and *how many
 * sections of this product give it*. The rule is the one a Georgian heating fitter quotes
 * over the phone: about 100 W per square metre at an ordinary ceiling — more under a high
 * one, a fifth more in a corner room with two outside walls — divided by what one section
 * of the chosen radiator gives (`wattsPerSection`, 110–180 W depending on the make). The
 * room's sections are then shared out between the radiators standing in it, each kept
 * between four sections and fourteen: below four a radiator is not worth hanging, above
 * fourteen the far end runs cold and a second radiator is the answer.
 *
 * Every radiator is a product, like every fitting and every door: `radiator` is the
 * `model3dKind`, one product per design, the style's own first. The model is one *section*;
 * the 3D view repeats it (`lib/design3d/buildStructure`). A radiator with no product in the
 * catalogue stays the flat estimate of `TECHNICAL_RATES` and is drawn with the style's
 * default sections.
 *
 * Pure: plain data in, plain data out.
 */

import { clearOf, nearestClear, wallBlocks, type WallBlock } from './wallClear';
import { freeSpans } from './decor/layout';
import { pointOnEdge, polygonCentroid, roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { toSceneProduct, type CatalogProduct } from './matcher';
import { planEdgeWalls, edgeWallKey } from './wallPieces';
import { WC_BOX_HALF_M, RADIATOR_BESIDE_WINDOW_M, RADIATOR_FLOOR_GAP_M, RADIATOR_SILL_GAP_M, TOWEL_RAIL_BOTTOM_M, TOWEL_RAIL_DEPTH_M, TOWEL_RAIL_HEIGHT_M, TOWEL_RAIL_ROOMS, TOWEL_RAIL_WIDTH_M } from './rules';
import type { DecorPiece, FloorPlan, Opening, PlacedItem, PlanRoom, StyleId, TechnicalPoint, Vec2 } from './types';
import type { RoomType } from '@/lib/calculator/types';

export const RADIATOR_PRODUCT_KIND = 'radiator';
export { RADIATOR_CATEGORY_SLUGS } from './catalog';

/** Heat a square metre of floor wants under a 2.7 m ceiling, watts. */
export const HEAT_W_PER_M2 = 100;
export const REFERENCE_CEILING_M = 2.7;
/** A room with two or more outside walls loses this much more. */
export const CORNER_ROOM_FACTOR = 1.2;
/** What a section gives when the product does not say. */
export const DEFAULT_WATTS_PER_SECTION = 170;
export const DEFAULT_SECTION_WIDTH_M = 0.08;
export const MIN_SECTIONS = 4;
export const MAX_SECTIONS = 14;
/** Rooms nobody heats. */
const UNHEATED: RoomType[] = ['balcony', 'storage', 'closet'];
/** An outside wall shorter than this does not make a corner room. */
const OUTSIDE_WALL_MIN_M = 1.5;

export function isHeatedRoom(room: Pick<PlanRoom, 'type'>): boolean {
  return !UNHEATED.includes(room.type);
}

/** The room's walls that have nothing but the outside behind most of their length. */
export function outsideEdges(plan: FloorPlan, room: PlanRoom): PlanEdge[] {
  const walls = planEdgeWalls(plan);
  return roomEdges(room.polygon).filter((edge) => {
    const wall = walls.get(edgeWallKey(room.id, edge.index));
    if (!wall) return false;
    const open = wall.pieces.filter((p) => !p.neighbour).reduce((sum, p) => sum + (p.to - p.from), 0);
    return open >= OUTSIDE_WALL_MIN_M && open >= edge.length * 0.5;
  });
}

/** Watts the room wants: its area, its height, and whether it stands on a corner of the flat. */
export function roomHeatDemandW(plan: FloorPlan, room: PlanRoom): number {
  if (!isHeatedRoom(room)) return 0;
  const corner = outsideEdges(plan, room).length >= 2 ? CORNER_ROOM_FACTOR : 1;
  return Math.round(room.areaM2 * HEAT_W_PER_M2 * Math.max(0.85, room.heightM / REFERENCE_CEILING_M) * corner);
}

/** Sections of a radiator giving `wattsPerSection` that cover the room's demand. */
export function sectionsForRoom(plan: FloorPlan, room: PlanRoom, wattsPerSection: number = DEFAULT_WATTS_PER_SECTION): number {
  const demand = roomHeatDemandW(plan, room);
  return demand > 0 ? Math.ceil(demand / Math.max(40, wattsPerSection)) : 0;
}

/** What a radiator product's `specs` carry. */
export interface RadiatorSpecs {
  wattsPerSection?: number;
  sectionWidthCm?: number;
}

export function radiatorSpecs(product: CatalogProduct): RadiatorSpecs {
  const specs = product.specs;
  return specs && typeof specs === 'object' && !Array.isArray(specs) ? (specs as RadiatorSpecs) : {};
}

/** The catalogue's radiators: the style's own first, then the cheapest per section. */
export function radiatorCandidates(catalog: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const affinity = (p: CatalogProduct) => {
    const tags = Array.isArray(p.styleTags) ? (p.styleTags as string[]) : [];
    // A product made for this style alone beats one that merely also suits it.
    return tags.includes(styleId) ? (tags[0] === styleId ? 2 : 1) : 0;
  };
  return catalog.filter((p) => p.model3dKind === RADIATOR_PRODUCT_KIND && !!p.model3dUrl).sort((a, b) => affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit);
}

export function isRadiatorProductKind(kind: string | null | undefined): boolean {
  return kind === RADIATOR_PRODUCT_KIND;
}

export function radiatorPoints(plan: FloorPlan): TechnicalPoint[] {
  return (plan.technical?.points ?? []).filter((p) => p.kind === 'radiator');
}

/** The room a radiator heats: the one it names, else the one it stands in. */
export function radiatorRoom(plan: FloorPlan, point: TechnicalPoint): PlanRoom | null {
  return plan.rooms.find((r) => r.id === point.roomId) ?? plan.rooms.find((r) => inside(point.position, r.polygon)) ?? nearestRoom(plan, point.position);
}

/**
 * How many sections one radiator has: what the person set, else its share of what its room
 * needs — the room's sections split evenly between the radiators standing in it.
 */
export function radiatorSections(plan: FloorPlan, point: TechnicalPoint): number {
  // A towel rail is one piece.
  if (point.towelRail) return 1;
  if (point.sections && point.sections > 0) return Math.round(point.sections);
  const room = radiatorRoom(plan, point);
  if (!room) return MIN_SECTIONS + 2;
  const siblings = radiatorPoints(plan).filter((p) => radiatorRoom(plan, p)?.id === room.id);
  const total = sectionsForRoom(plan, room, point.radiator?.wattsPerSection ?? DEFAULT_WATTS_PER_SECTION);
  if (total === 0) return MIN_SECTIONS;
  return Math.max(MIN_SECTIONS, Math.min(MAX_SECTIONS, Math.ceil(total / Math.max(1, siblings.length))));
}

/** How many radiators a room wants so that none needs more than `MAX_SECTIONS`. */
export function radiatorsNeeded(plan: FloorPlan, room: PlanRoom, wattsPerSection: number = DEFAULT_WATTS_PER_SECTION): number {
  const sections = sectionsForRoom(plan, room, wattsPerSection);
  return sections === 0 ? 0 : Math.max(1, Math.ceil(sections / MAX_SECTIONS));
}

/** The radiator as `product` (or none): its per-section facts ride along, its price is per section × sections. */
export function withRadiatorProduct(plan: FloorPlan, point: TechnicalPoint, product: CatalogProduct | null): TechnicalPoint {
  if (!product) {
    const { product: _product, radiator: _radiator, ...rest } = point;
    return rest;
  }
  const radiator = {
    ...radiatorFacts(product),
    heightM: (product.heightCm ?? 60) / 100,
    depthM: (product.depthCm ?? 10) / 100,
  };
  const next: TechnicalPoint = { ...point, radiator };
  return { ...next, product: toSceneProduct(product, radiatorSections(plan, next)) };
}

/** The window a radiator hangs under: one on its wall whose width spans the radiator's spot. */
export function windowOver(plan: FloorPlan, point: TechnicalPoint): Opening | null {
  const spot = radiatorWallSpot(plan, point);
  if (!spot) return null;
  return spot.room.openings.find((o) => o.kind === 'window' && o.wallIndex === spot.edge.index && Math.abs(o.t * spot.edge.length - spot.s) <= o.widthM / 2 + 0.05) ?? null;
}

/**
 * The tallest a radiator may be where it hangs: its top at least 10 cm under the sill of the
 * window over it, its bottom 10–12 cm off the floor (`lib/design/rules`). Null under no window.
 */
export function radiatorHeadroomM(plan: FloorPlan, point: TechnicalPoint): number | null {
  const window = windowOver(plan, point);
  if (!window) return null;
  return Math.round((window.sillM - (point.elevationM ?? RADIATOR_FLOOR_GAP_M) - RADIATOR_SILL_GAP_M) * 100) / 100;
}

/**
 * The radiator product for one point: the first of the candidates (the style's, then the
 * cheapest) that fits under the window over it; under no window, or under one too low for any,
 * the first.
 */
export function radiatorProductFor(plan: FloorPlan, point: TechnicalPoint, candidates: CatalogProduct[]): CatalogProduct | null {
  const headroom = radiatorHeadroomM(plan, point);
  if (headroom === null) return candidates[0] ?? null;
  return candidates.find((p) => (p.heightCm ?? 60) / 100 <= headroom + 1e-6) ?? candidates[0] ?? null;
}

/**
 * Every radiator without a product takes the catalogue's best for the style that fits under
 * its window, and every one with a product is priced again for the sections it has now (a room that grew, a second
 * radiator added beside it). The same plan object comes back when nothing changed.
 */
export function withRadiatorProducts(plan: FloorPlan, catalog: CatalogProduct[], styleId: StyleId): FloorPlan {
  const points = plan.technical?.points ?? [];
  if (!points.some((p) => p.kind === 'radiator')) return plan;
  const candidates = radiatorCandidates(catalog, styleId);
  let changed = false;
  // Products first, so the sections below are counted with every radiator's own watts.
  const withProducts = points.map((point) => {
    if (point.kind !== 'radiator' || point.towelRail || point.product || candidates.length === 0) return point;
    changed = true;
    return withRadiatorProduct(plan, point, radiatorProductFor(plan, point, candidates));
  });
  const staged: FloorPlan = { ...plan, technical: { ...plan.technical, points: withProducts } };
  const priced = withProducts.map((point) => {
    if (point.kind !== 'radiator' || !point.product) return point;
    const qty = radiatorSections(staged, point);
    if (point.product.qty === qty) return point;
    changed = true;
    return { ...point, product: { ...point.product, qty, totalPrice: Math.round(point.product.pricePerUnit * qty * 100) / 100 } };
  });
  return changed ? { ...plan, technical: { ...plan.technical, points: priced } } : plan;
}

/**
 * Radiators for the rooms that have none: under the windows of the outside walls, the way
 * they are hung — as many as the room's sections call for, never more than it has windows
 * (a room without a window gets one on its longest outside wall, or its longest wall).
 *
 * They come back as the person's own (`origin: 'user'`), not as the app's suggestions: this
 * runs when the button is pressed, and a radiator nobody asked for should not appear at
 * all — while one that was asked for has to be in the budget even in a finished home, where
 * only what the person added is new work.
 *
 * Given the style (`styleId`), each is placed as the product it will be (`radiatorProductFor`, from
 * `radiatorCandidates`): the room's count from the heat a section of the style's radiator gives,
 * and each radiator at its own length — its share of the room's sections at its section's width —
 * so it is hung clear of a door and of the next radiator at the length it is bought at. Where no
 * wall has room for that length, and with no style, it is placed as a middling radiator, 80 cm
 * (`BESIDE_RADIATOR_M`), as before.
 */
export function suggestRadiators(plan: FloorPlan, nextId: () => string, catalog: CatalogProduct[] = [], items: PlacedItem[] = [], decor: readonly DecorPiece[] = [], styleId?: StyleId): TechnicalPoint[] {
  // The lowest radiator there is: a window whose sill leaves less room than this has its radiator beside it.
  const heights = catalog.filter((p) => p.model3dKind === RADIATOR_PRODUCT_KIND && p.heightCm).map((p) => p.heightCm! / 100);
  const lowest = heights.length > 0 ? Math.min(...heights) : LOWEST_RADIATOR_M;
  const candidates = styleId ? radiatorCandidates(catalog, styleId) : [];
  const existing = radiatorPoints(plan);
  const out: TechnicalPoint[] = [];
  for (const room of plan.rooms) {
    if (!isHeatedRoom(room) || room.areaM2 < 3.5) continue;
    if (existing.some((p) => radiatorRoom(plan, p)?.id === room.id)) continue;
    const wanted = radiatorsNeeded(plan, room, candidates[0] ? radiatorFacts(candidates[0]).wattsPerSection : DEFAULT_WATTS_PER_SECTION);
    if (wanted === 0) continue;
    const edges = wallEdges(room);
    if (TOWEL_RAIL_ROOMS.includes(room.type)) {
      // A bathroom's heater is a towel rail, on the longest stretch of wall clear of its door and
      // window (not under the window, where a radiator goes).
      // Over the WC when the room has one (the rulebook, BA-19: with no towel shelf the towels hang
      // there), its bottom clear of the WC's box; else the longest clear wall.
      const overWc = towelRailOverWc(room, items);
      const spot = overWc?.at ?? towelRailSpot(room, edges, items, decor);
      if (spot) {
        out.push({
          id: nextId(),
          kind: 'radiator',
          towelRail: true,
          roomId: room.id,
          position: { x: round2(spot.x), z: round2(spot.z) },
          elevationM: overWc?.bottomM ?? TOWEL_RAIL_BOTTOM_M,
          radiator: { wattsPerSection: TOWEL_RAIL_WATTS, sectionWidthM: TOWEL_RAIL_WIDTH_M, heightM: TOWEL_RAIL_HEIGHT_M, depthM: TOWEL_RAIL_DEPTH_M },
          origin: 'user',
        });
      }
      continue;
    }
    const windows = room.openings.filter((o) => o.kind === 'window').sort((a, b) => b.widthM - a.widthM);
    const spots: Array<{ edge: PlanEdge; t: number }> = [];
    for (const window of windows.slice(0, Math.max(1, wanted))) {
      const edge = edges.find((e) => e.index === window.wallIndex);
      if (!edge) continue;
      if (window.sillM - RADIATOR_FLOOR_GAP_M - RADIATOR_SILL_GAP_M >= lowest - 1e-6) spots.push({ edge, t: window.t });
      else {
        // A floor-length window (a balcony door's glass): the radiator goes beside it on the same wall —
        // at the style's radiator's length where that side has the room, else a middling one's.
        const own = candidates[0] ? radiatorLengthM(plan, room, candidates[0], Math.max(1, wanted)) : null;
        const beside = (own != null && own > BESIDE_RADIATOR_M ? besideWindow(room, edge, window, own) : null) ?? besideWindow(room, edge, window);
        if (beside !== null) spots.push({ edge, t: beside });
      }
    }
    if (spots.length === 0) {
      const outside = outsideEdges(plan, room);
      const tooLow = (o: Opening) => o.kind === 'window' && o.sillM - RADIATOR_FLOOR_GAP_M - RADIATOR_SILL_GAP_M < lowest - 1e-6;
      const pool = (outside.length > 0 ? outside : edges).filter((e) => !room.openings.some((o) => o.wallIndex === e.index && (o.kind !== 'window' || tooLow(o))));
      const edge = [...(pool.length > 0 ? pool : edges)].sort((a, b) => b.length - a.length)[0];
      if (edge) spots.push({ edge, t: 0.5 });
    }
    // Each where it is wanted, or — in a furnished room, across a door, on another radiator — on the
    // nearest wall clear of them (`clearSpot`). The ones that stay where they are wanted are hung
    // first, so one that has to move goes clear of them rather than onto another's spot.
    // Each as long as the product it will be (its window's, `radiatorProductFor`); with no style, as
    // long as the longest the catalogue's could turn out, placed by a middling one's 80 cm.
    const expected = expectedLengthM(plan, room, spots.length, catalog);
    const sizes = spots.map((spot): RadiatorSize => {
      const product = candidates.length > 0 ? radiatorProductFor(plan, { id: '', kind: 'radiator', roomId: room.id, position: offWall(spot), elevationM: RADIATOR_FLOOR_GAP_M, origin: 'user' }, candidates) : null;
      const lengthM = product ? radiatorLengthM(plan, room, product, spots.length) : null;
      return lengthM != null ? { widthM: lengthM, reachM: lengthM / 2 } : { widthM: null, reachM: expected - BESIDE_RADIATOR_M / 2 };
    });
    const hung: Array<HungRadiator | null> = spots.map(() => null);
    const placed = () => hung.flatMap((spot) => spot ?? []);
    spots.forEach((wanted, i) => {
      if (clearSpot(plan, room, wanted, items, decor, lowest, placed(), sizes[i].widthM) === wanted) hung[i] = { ...wanted, reachM: sizes[i].reachM };
    });
    spots.forEach((wanted, i) => {
      hung[i] ??= { ...clearSpot(plan, room, wanted, items, decor, lowest, placed(), sizes[i].widthM), reachM: sizes[i].reachM };
    });
    for (const spot of placed()) {
      out.push({
        id: nextId(),
        kind: 'radiator',
        roomId: room.id,
        position: offWall(spot),
        elevationM: RADIATOR_FLOOR_GAP_M,
        origin: 'user',
      });
    }
  }
  return out;
}

/**
 * A towel rail on the wall behind the room's WC, centred over it: its bottom 10 cm over the WC's
 * half-height box (1.1 m), lowered to fit under the ceiling but never under 0.9 m
 * (`TOWEL_RAIL_OVER_WC_MIN_M`). Null with no WC,
 * or a ceiling too low for it there.
 */
function towelRailOverWc(room: PlanRoom, items: PlacedItem[]): { at: Vec2; bottomM: number } | null {
  const wc = items.find((i) => i.roomId === room.id && i.slot === 'toilet');
  if (!wc) return null;
  const f = { x: Math.sin(wc.rotation), z: Math.cos(wc.rotation) };
  const back = { x: wc.position.x - f.x * (wc.size.depth / 2), z: wc.position.z - f.z * (wc.size.depth / 2) };
  const bottom = Math.min(WC_BOX_HALF_M + 0.1, room.heightM - TOWEL_RAIL_HEIGHT_M - 0.1);
  if (bottom < TOWEL_RAIL_OVER_WC_MIN_M) return null;
  // On the box's face when the WC stands off its wall in front of one.
  return { at: { x: back.x + f.x * 0.06, z: back.z + f.z * 0.06 }, bottomM: Math.round(bottom * 100) / 100 };
}

/** The lowest a towel rail is hung over a WC: one hung this high or higher has the WC standing under it. */
export const TOWEL_RAIL_OVER_WC_MIN_M = 0.9;

/** What a towel rail gives, W: a bathroom's heat in one piece. */
const TOWEL_RAIL_WATTS = 450;

/** A radiator's spot: a wall of its room and how far along it, 0..1. */
type RadiatorSpot = { edge: PlanEdge; t: number };
/** One already hung in the room, and how far either side of its spot it takes of its wall. */
type HungRadiator = RadiatorSpot & { reachM: number };
/** How long a radiator is placed as (null: not known, a middling one's 80 cm), and how far either side it then takes. */
type RadiatorSize = { widthM: number | null; reachM: number };

/** A radiator's point: on its wall, a hand inside the room. */
function offWall(spot: RadiatorSpot): Vec2 {
  const at = pointOnEdge(spot.edge, spot.t);
  return { x: round2(at.x + spot.edge.inward.x * 0.08), z: round2(at.z + spot.edge.inward.z * 0.08) };
}

/** What a radiator product gives a section and how wide one is (`withRadiatorProduct` reads the same). */
function radiatorFacts(product: CatalogProduct): { wattsPerSection: number; sectionWidthM: number } {
  const specs = radiatorSpecs(product);
  return { wattsPerSection: specs.wattsPerSection ?? DEFAULT_WATTS_PER_SECTION, sectionWidthM: (specs.sectionWidthCm ?? product.widthCm ?? DEFAULT_SECTION_WIDTH_M * 100) / 100 };
}

/** How long a radiator of this product is when it is one of `radiators` in the room: its share of the room's sections (`radiatorSections`) at its section's width. */
function radiatorLengthM(plan: FloorPlan, room: PlanRoom, product: CatalogProduct, radiators: number): number {
  const { wattsPerSection, sectionWidthM } = radiatorFacts(product);
  return Math.max(MIN_SECTIONS, Math.min(MAX_SECTIONS, Math.ceil(sectionsForRoom(plan, room, wattsPerSection) / Math.max(1, radiators)))) * sectionWidthM;
}

/**
 * Where a radiator hangs: where it was wanted when nothing stands there; else the nearest clear
 * stretch of the same wall, then of another outside wall, then of any wall — clear of the doors and
 * the windows too low for it, of the radiators already hung in the room (`hung`, each as far either
 * side as it takes), and, in a furnished room (the owner's notes of 13 Nov 2026), of the furniture
 * standing against the wall, of the joinery and of decorated wall. With nowhere clear of the
 * furniture it goes where it was wanted and the rule check says it is blocked — unless that is
 * across a door or on another radiator: then on the nearest wall that is neither. All of it at the
 * radiator's own length (`widthM`) when that is known; where no wall holds that length clear of the
 * doors and the radiators, as a middling one (80 cm, `BESIDE_RADIATOR_M`) as before — and where no
 * wall holds even that, in the middle of the widest. An empty room is as it was, but for a radiator
 * that would hang across a door or on another. The very `wanted` comes back when it stays.
 */
function clearSpot(plan: FloorPlan, room: PlanRoom, wanted: RadiatorSpot, items: readonly PlacedItem[], decor: readonly DecorPiece[], heightM: number, hung: readonly HungRadiator[] = [], widthM: number | null = null): RadiatorSpot {
  return (widthM != null ? spotClear(plan, room, wanted, items, decor, heightM, hung, widthM, false) : null) ?? spotClear(plan, room, wanted, items, decor, heightM, hung, BESIDE_RADIATOR_M, true)!;
}

/** `clearSpot` at one length; when not `settle`, null where no wall holds that length clear of the doors and the other radiators. */
function spotClear(plan: FloorPlan, room: PlanRoom, wanted: RadiatorSpot, items: readonly PlacedItem[], decor: readonly DecorPiece[], heightM: number, hung: readonly HungRadiator[], width: number, settle: boolean): RadiatorSpot | null {
  const furnished = items.some((i) => i.roomId === room.id) || decor.some((d) => d.roomId === room.id);
  const band = { bottom: RADIATOR_FLOOR_GAP_M, top: RADIATOR_FLOOR_GAP_M + heightM };
  // What no radiator hangs across: a door, and a window whose sill does not leave it the room.
  const low = (edge: PlanEdge) => room.openings.filter((o) => o.wallIndex === edge.index && !(o.kind === 'window' && o.sillM - RADIATOR_FLOOR_GAP_M - RADIATOR_SILL_GAP_M >= heightM - 1e-6));
  // The radiators already hung on a wall, each as far either side of its spot as it takes.
  const taken = (edge: PlanEdge): WallBlock[] =>
    hung.filter((spot) => spot.edge.index === edge.index).map((spot) => ({ from: spot.t * edge.length - spot.reachM, to: spot.t * edge.length + spot.reachM, bottom: band.bottom, top: band.top }));
  // Wall a radiator may hang on at all, and — in a furnished room — what of it nothing stands at.
  const open = (edge: PlanEdge) => clearOf(freeSpans(edge, low(edge), 0.1, edge.length - 0.1, 0.1), taken(edge), band);
  const stretches = (edge: PlanEdge) => (furnished ? clearOf(open(edge), wallBlocks(room, edge, items, decor), band) : open(edge));
  const at = wanted.t * wanted.edge.length;
  const across =
    low(wanted.edge).some((o) => Math.abs(o.t * wanted.edge.length - at) < o.widthM / 2 + width / 2 - 1e-6) ||
    taken(wanted.edge).some((block) => at + width / 2 > block.from + 1e-6 && at - width / 2 < block.to - 1e-6);
  if (!furnished && !across) return wanted;
  const outside = outsideEdges(plan, room);
  const others = [...outside, ...wallEdges(room).filter((e) => !outside.some((o) => o.index === e.index))].filter((e) => e.index !== wanted.edge.index);
  const nearest = (spans: (edge: PlanEdge) => Array<[number, number]>): RadiatorSpot | null => {
    const here = nearestClear(spans(wanted.edge), at, width);
    if (here != null) return Math.abs(here - at) < 0.01 ? wanted : { edge: wanted.edge, t: here / wanted.edge.length };
    for (const edge of others) {
      const s = nearestClear(spans(edge), edge.length / 2, width);
      if (s != null) return { edge, t: s / edge.length };
    }
    return null;
  };
  const clear = nearest(stretches);
  if (clear || !across) return clear ?? wanted;
  const beside = furnished ? nearest(open) : null;
  if (beside) return beside;
  if (!settle) return null;
  let widest: { edge: PlanEdge; t: number; length: number } | null = null;
  for (const edge of [wanted.edge, ...others]) {
    for (const [a, b] of open(edge)) if (!widest || b - a > widest.length + 1e-6) widest = { edge, t: (a + b) / 2 / edge.length, length: b - a };
  }
  return widest ? { edge: widest.edge, t: widest.t } : wanted;
}

/**
 * How long a radiator may turn out, before it has a product: its share of the room's sections at
 * the section's width (what `radiatorBody` measures) — of the longest of the catalogue's radiators,
 * whichever the style then picks; of the default section with no catalogue. Never less than the
 * middling length it is placed by.
 */
function expectedLengthM(plan: FloorPlan, room: PlanRoom, radiators: number, catalog: readonly CatalogProduct[]): number {
  const products = catalog.filter((p) => p.model3dKind === RADIATOR_PRODUCT_KIND).map((p) => {
    const facts = radiatorFacts(p);
    return { watts: facts.wattsPerSection, widthM: facts.sectionWidthM };
  });
  const lengths = (products.length > 0 ? products : [{ watts: DEFAULT_WATTS_PER_SECTION, widthM: DEFAULT_SECTION_WIDTH_M }]).map(
    ({ watts, widthM }) => Math.max(MIN_SECTIONS, Math.min(MAX_SECTIONS, Math.ceil(sectionsForRoom(plan, room, watts) / Math.max(1, radiators)))) * widthM,
  );
  return Math.max(BESIDE_RADIATOR_M, ...lengths);
}

/**
 * The middle of the longest stretch of wall clear of the doors and windows (10 cm round each) that
 * holds a towel rail, a hand off the wall — and, in a furnished bathroom, clear of what stands
 * against the wall at the rail's height: the vanity and its mirror, the washing machine's column,
 * the shower's glass. Null when no wall has the room.
 */
function towelRailSpot(room: PlanRoom, edges: PlanEdge[], items: readonly PlacedItem[] = [], decor: readonly DecorPiece[] = []): Vec2 | null {
  const band = { bottom: TOWEL_RAIL_BOTTOM_M, top: TOWEL_RAIL_BOTTOM_M + TOWEL_RAIL_HEIGHT_M };
  let best: { at: Vec2; length: number } | null = null;
  for (const edge of edges) {
    const blocked = room.openings
      .filter((o) => o.wallIndex === edge.index)
      .map((o) => [o.t * edge.length - o.widthM / 2 - 0.1, o.t * edge.length + o.widthM / 2 + 0.1] as const)
      .sort((a, b) => a[0] - b[0]);
    let from = 0.1;
    const spans: Array<[number, number]> = [];
    for (const [lo, hi] of blocked) {
      if (lo > from) spans.push([from, lo]);
      from = Math.max(from, hi);
    }
    if (edge.length - 0.1 > from) spans.push([from, edge.length - 0.1]);
    for (const [a, b] of clearOf(spans, wallBlocks(room, edge, items, decor), band)) {
      if (b - a < TOWEL_RAIL_WIDTH_M + 0.1 || (best && b - a <= best.length)) continue;
      const p = pointOnEdge(edge, (a + b) / 2 / edge.length);
      best = { at: { x: p.x + edge.inward.x * 0.08, z: p.z + edge.inward.z * 0.08 }, length: b - a };
    }
  }
  return best?.at ?? null;
}

/** A radiator's length when it is placed before its sections are counted: a middling one. */
const BESIDE_RADIATOR_M = 0.8;
/** The lowest radiator when the catalogue is not to hand. */
const LOWEST_RADIATOR_M = 0.5;

/**
 * Where on a window's wall a radiator `lengthM` long goes beside it rather than under it: the side
 * with more clear wall, its near end 15 cm from the window and clear of every other opening — or
 * null when neither side has the room.
 */
function besideWindow(room: PlanRoom, edge: PlanEdge, window: Opening, lengthM = BESIDE_RADIATOR_M): number | null {
  const centre = window.t * edge.length;
  const reach = window.widthM / 2 + RADIATOR_BESIDE_WINDOW_M + lengthM / 2;
  const sides = [centre - reach, centre + reach]
    .filter((s) => s - lengthM / 2 >= 0.1 && s + lengthM / 2 <= edge.length - 0.1)
    .filter((s) => !room.openings.some((o) => o !== window && o.wallIndex === edge.index && Math.abs(o.t * edge.length - s) < o.widthM / 2 + lengthM / 2 + 0.05))
    .sort((a, b) => Math.min(b, edge.length - b) - Math.min(a, edge.length - a));
  return sides.length > 0 ? sides[0] / edge.length : null;
}

/** A radiator's height and depth when it has no product: a middling one. */
export const RADIATOR_HEIGHT_M = 0.6;
export const RADIATOR_DEPTH_M = 0.1;

/** A radiator (or a towel rail) as it hangs on its wall. */
export interface RadiatorBody {
  point: TechnicalPoint;
  room: PlanRoom;
  edge: PlanEdge;
  /** Its middle and its two ends along the wall, metres from the wall's first corner. */
  s: number;
  from: number;
  to: number;
  /** Its bottom and its top off the floor. */
  bottom: number;
  top: number;
  /** How far it stands out from the wall. */
  depthM: number;
}

/**
 * What a radiator takes of its wall: its sections' length about its point (a towel rail's one
 * piece), from its bottom to its top. The one measure of it — the strip kept clear in front of it
 * (`ruleChecks`), and the wall no socket is put on (`radiatorWallBlocks`). Null when its room has no wall.
 */
export function radiatorBody(plan: FloorPlan, point: TechnicalPoint): RadiatorBody | null {
  const spot = radiatorWallSpot(plan, point);
  if (!spot) return null;
  const rail = !!point.towelRail;
  const length = radiatorSections(plan, point) * (point.radiator?.sectionWidthM ?? (rail ? TOWEL_RAIL_WIDTH_M : DEFAULT_SECTION_WIDTH_M));
  const bottom = point.elevationM ?? (rail ? TOWEL_RAIL_BOTTOM_M : RADIATOR_FLOOR_GAP_M);
  return {
    point,
    room: spot.room,
    edge: spot.edge,
    s: spot.s,
    from: Math.max(0, spot.s - length / 2),
    to: Math.min(spot.edge.length, spot.s + length / 2),
    bottom,
    top: bottom + (point.radiator?.heightM ?? (rail ? TOWEL_RAIL_HEIGHT_M : RADIATOR_HEIGHT_M)),
    depthM: point.radiator?.depthM ?? (rail ? TOWEL_RAIL_DEPTH_M : RADIATOR_DEPTH_M),
  };
}

/** Every radiator and towel rail of the flat on its wall. */
export function radiatorBodies(plan: FloorPlan): RadiatorBody[] {
  return radiatorPoints(plan).flatMap((point) => radiatorBody(plan, point) ?? []);
}

/** The radiators hanging on one wall of a room, as what is in front of that wall (`wallClear`). */
export function radiatorWallBlocks(bodies: readonly RadiatorBody[], room: Pick<PlanRoom, 'id'>, edge: Pick<PlanEdge, 'index'>): WallBlock[] {
  return bodies.filter((body) => body.room.id === room.id && body.edge.index === edge.index).map((body) => ({ from: body.from, to: body.to, bottom: body.bottom, top: body.top }));
}

/** Where a radiator hangs: the wall of its room nearest to its point, and the spot along it. */
export function radiatorWallSpot(plan: FloorPlan, point: TechnicalPoint): { room: PlanRoom; edge: PlanEdge; s: number } | null {
  const room = radiatorRoom(plan, point);
  if (!room) return null;
  let best: { edge: PlanEdge; s: number; distance: number } | null = null;
  for (const edge of wallEdges(room)) {
    const s = Math.max(0, Math.min(edge.length, (point.position.x - edge.a.x) * edge.dir.x + (point.position.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.position.x - (edge.a.x + edge.dir.x * s), point.position.z - (edge.a.z + edge.dir.z * s));
    if (!best || distance < best.distance) best = { edge, s, distance };
  }
  return best ? { room, edge: best.edge, s: best.s } : null;
}

function inside(point: Vec2, polygon: Vec2[]): boolean {
  let within = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) within = !within;
  }
  return within;
}

function nearestRoom(plan: FloorPlan, point: Vec2): PlanRoom | null {
  let best: { room: PlanRoom; distance: number } | null = null;
  for (const room of plan.rooms) {
    const c = polygonCentroid(room.polygon);
    const distance = Math.hypot(c.x - point.x, c.z - point.z);
    if (!best || distance < best.distance) best = { room, distance };
  }
  return best && best.distance < 8 ? best.room : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
