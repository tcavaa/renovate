/**
 * A gas boiler's ventilated cabinet (the design rules, `lib/design/rules.ts`): on a balcony, in a
 * kitchen or in a bathroom the boiler is built into a cabinet with louvres, its service access
 * kept, rather than hidden behind sealed finishes. The joiner makes it to measure and prices it
 * like a made-to-measure kitchen: per m² of its façade (the front and the two sides), in one of
 * the joiner's materials, products of the `boiler-cabinet` category whose price admin sets in the
 * product form.
 *
 * - **Indoors** it stands on the floor and reaches a hand over the boiler, the boiler's width and
 *   10 cm either side, no deeper than 60 cm; the person sets its width, height and height off the
 *   floor on the boiler's card (`cabinetSize`).
 * - **On a balcony** (the owner's photo of 13 Nov 2026) it is a cupboard from the floor to the
 *   ceiling, at least 80 cm wide, with two leaves below and two above and a filler strip beside
 *   them, insulated against the frost — made in the joiner's **thermal** material
 *   (`isThermalCabinet`), which goes first there and last indoors.
 *
 * Every boiler gets one in the first material for its room (the style's, then the cheapest) once
 * the catalogue is in (`withBoilerCabinets`, run with the equipment's products); the boiler's card
 * changes the material or takes the cabinet off (`cabinet: null`). A material the person chose
 * stays (`cabinetChosen`); one the app gave follows the boiler indoors or out. Drawn in 3D round
 * the boiler (`buildEquipment`). Pure.
 */

import { isBoilerCabinetMaterial } from './catalog';
import { toSceneProduct, type CatalogProduct } from './matcher';
import { pointInPolygon } from './planGeometry';
import { BOILER_CABINET_CLEARANCE_M, BOILER_CABINET_MAX_DEPTH_M, BOILER_DEFAULT_SIZE_M } from './rules';
import type { FloorPlan, PlanRoom, StyleId, TechnicalPoint } from './types';

/** The room a boiler's cabinet is measured in: its type and its ceiling. */
type CabinetRoom = Pick<PlanRoom, 'type' | 'heightM'> | null | undefined;

/** An outdoor cupboard is at least this wide and deep, and never taller than this. */
const OUTDOOR_MIN_WIDTH_M = 0.8;
const OUTDOOR_MIN_DEPTH_M = 0.45;
const OUTDOOR_MAX_HEIGHT_M = 3;

/** Whether a boiler's cupboard stands outdoors: on a balcony. */
export function isOutdoorCabinet(room: CabinetRoom): boolean {
  return room?.type === 'balcony';
}

/** A material for an outdoor cupboard: insulated. Named by its slug (a scene's snapshot has no specs), or `specs.thermal`. */
export function isThermalCabinet(product: { slug?: string | null; specs?: unknown }): boolean {
  const specs = product.specs as { thermal?: unknown } | null | undefined;
  return specs?.thermal === true || /(^|-)thermal(-|$)/.test(product.slug ?? '');
}

/** The room a boiler stands in: its own (`roomId`), else the one its point is in. */
export function boilerRoom(plan: Pick<FloorPlan, 'rooms'>, point: Pick<TechnicalPoint, 'roomId' | 'position'>): PlanRoom | null {
  return plan.rooms.find((r) => r.id === point.roomId) ?? plan.rooms.find((r) => pointInPolygon(point.position, r.polygon)) ?? null;
}

/** What a cabinet is measured from: the boiler's size and height off the floor, and the person's own sizes for the cabinet. */
type CabinetPoint = Pick<TechnicalPoint, 'sizeM'> & Partial<Pick<TechnicalPoint, 'elevationM' | 'cabinetSize'>>;

/** Where a boiler hangs when its point does not say (`TECHNICAL_KINDS.boiler`). */
const BOILER_ELEVATION_M = 1.6;
/** The narrowest and lowest a cabinet is made by hand. */
const CABINET_MIN_M = 0.3;

/**
 * The cabinet's outside size, metres, and how high its bottom is off the floor. It stands on the
 * floor (the owner's notes of 14 Nov 2026) and reaches a hand over the boiler — to the ceiling on
 * a balcony — the boiler's width and the clearance either side, its depth capped; the person's
 * own width, height and height off the floor (`cabinetSize`, the boiler's card) go before these,
 * never narrower than the boiler nor through the ceiling.
 */
export function boilerCabinetSize(point: CabinetPoint, room?: CabinetRoom): { width: number; depth: number; height: number; bottom: number } {
  const boiler = point.sizeM ?? BOILER_DEFAULT_SIZE_M;
  const c = BOILER_CABINET_CLEARANCE_M;
  const outdoor = isOutdoorCabinet(room);
  const ceiling = Math.min(OUTDOOR_MAX_HEIGHT_M, room?.heightM ?? OUTDOOR_MAX_HEIGHT_M);
  const own = point.cabinetSize ?? {};
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const bottom = round(Math.min(Math.max(0, own.bottomM ?? 0), ceiling - CABINET_MIN_M));
  const top = Math.min(ceiling, (point.elevationM ?? BOILER_ELEVATION_M) + boiler.height + c);
  const height = round(Math.min(ceiling - bottom, Math.max(CABINET_MIN_M, own.heightM ?? (outdoor ? ceiling : top) - bottom)));
  const width = round(Math.min(3, Math.max(boiler.width + 0.04, own.widthM ?? (outdoor ? Math.max(OUTDOOR_MIN_WIDTH_M, boiler.width + 3 * c) : boiler.width + 2 * c))));
  const depth = Math.min(BOILER_CABINET_MAX_DEPTH_M, boiler.depth + c);
  return { width, depth: outdoor ? Math.max(OUTDOOR_MIN_DEPTH_M, depth) : depth, height, bottom };
}

/** Square metres of façade the joiner prices: the front and the two sides. */
export function boilerCabinetFacadeM2(point: CabinetPoint, room?: CabinetRoom): number {
  const { width, depth, height } = boilerCabinetSize(point, room);
  return Math.round((width * height + 2 * depth * height) * 100) / 100;
}

/**
 * The joiner's cabinet materials for a room: outdoors the insulated ones first, indoors last (they
 * cost more and are not needed); then the style's own, then the cheaper.
 */
export function boilerCabinetCandidates(catalog: CatalogProduct[], styleId: StyleId, room?: CabinetRoom): CatalogProduct[] {
  const affinity = (p: CatalogProduct) => (Array.isArray(p.styleTags) && (p.styleTags as string[]).includes(styleId) ? 1 : 0);
  const outdoor = isOutdoorCabinet(room);
  const suits = (p: CatalogProduct) => (isThermalCabinet(p) === outdoor ? 1 : 0);
  return catalog.filter(isBoilerCabinetMaterial).sort((a, b) => suits(b) - suits(a) || affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit);
}

/** The boiler with its cabinet in `material` (or none), bought by its façade; `chosen` when the person picked it. */
export function withBoilerCabinet(point: TechnicalPoint, material: CatalogProduct | null, room?: CabinetRoom, chosen = false): TechnicalPoint {
  const { cabinetChosen: _was, ...rest } = point;
  return { ...rest, cabinet: material ? toSceneProduct(material, boilerCabinetFacadeM2(point, room)) : null, ...(chosen ? { cabinetChosen: true } : {}) };
}

/**
 * Every boiler that has not been given a cabinet takes one in the first material for its room, one
 * the app gave is changed for the room's when the boiler went out onto a balcony or came in from
 * it, and one that has a cabinet is measured again (a boiler of another size, another room). A
 * cabinet taken off stays off, a material the person chose stays. The same plan comes back when
 * nothing changed.
 */
export function withBoilerCabinets(plan: FloorPlan, catalog: CatalogProduct[], styleId: StyleId): FloorPlan {
  const points = plan.technical?.points ?? [];
  if (!points.some((p) => p.kind === 'boiler')) return plan;
  let changed = false;
  const next = points.map((point) => {
    if (point.kind !== 'boiler' || point.cabinet === null) return point;
    const room = boilerRoom(plan, point);
    const first = boilerCabinetCandidates(catalog, styleId, room)[0];
    if (point.cabinet) {
      // The app's own pick follows the boiler indoors or out; the person's stays.
      if (first && !point.cabinetChosen && first.id !== point.cabinet.productId && isThermalCabinet(first) !== isThermalCabinet(point.cabinet)) {
        changed = true;
        return withBoilerCabinet(point, first, room);
      }
      const qty = boilerCabinetFacadeM2(point, room);
      if (point.cabinet.qty === qty) return point;
      changed = true;
      return { ...point, cabinet: { ...point.cabinet, qty, totalPrice: Math.round(point.cabinet.pricePerUnit * qty * 100) / 100 } };
    }
    if (!first) return point;
    changed = true;
    return withBoilerCabinet(point, first, room);
  });
  return changed ? { ...plan, technical: { ...plan.technical, points: next } } : plan;
}
