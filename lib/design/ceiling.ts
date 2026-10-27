/**
 * The new ceiling a renovation hangs, and what hangs from it.
 *
 * A suspended plasterboard ceiling costs the room about 10 cm, a stretch one 3 cm
 * (`lib/design/rules.ts`). Whether a flat gets one is the renovation's ceiling work (phase 12):
 * a full renovation whose works — ticked, or the home state's — include it, in the material the
 * person chose (`plan.technical.choices.ceiling`). The drop is kept on the plan
 * (`plan.technical.ceilingDropM`) so everything that measures to the ceiling (`ceilingHeightM`,
 * `underCeiling`) reads one number; the store recomputes it whenever one of those changes
 * (`withCeiling`) and hangs again what was hung from the old ceiling — the ceiling lights, the
 * pendants, the curtains, an air conditioner left at its usual height. Pure.
 */

import { CEILING_PHASE } from '@/lib/calculator/constants';
import type { HomeState } from '@/lib/calculator/types';
import { getArchetype } from './catalog';
import { ELECTRICAL_KINDS } from './electrical';
import { CURTAIN_UNDER_CEILING_M, GYPSUM_CEILING_DROP_M, STRETCH_CEILING_DROP_M, ceilingHeightM, underCeiling } from './rules';
import { effectivePhases, technicalElevation } from './technical';
import type { DesignMode, ElectricalPoint, FloorPlan, PlacedItem } from './types';

/** How far the flat's new ceiling hangs under the slab: none unless a full renovation does the ceiling. */
export function ceilingDropFor(plan: FloorPlan, mode: DesignMode, homeState: HomeState | null): number {
  if (mode !== 'full' || !homeState) return 0;
  if (!effectivePhases(homeState, plan.technical?.works).includes(CEILING_PHASE)) return 0;
  return plan.technical?.choices?.ceiling === 'barisol' ? STRETCH_CEILING_DROP_M : GYPSUM_CEILING_DROP_M;
}

/**
 * The plan with its ceiling drop brought up to date, and what hangs from the ceiling hung again
 * from the new one. The same objects come back when nothing changed.
 */
export function withCeiling<S extends { plan: FloorPlan | null; items: PlacedItem[]; electrical: ElectricalPoint[] }>(state: S, mode: DesignMode, homeState: HomeState | null): Pick<S, 'plan' | 'items' | 'electrical'> {
  const { plan } = state;
  if (!plan) return state;
  const drop = ceilingDropFor(plan, mode, homeState);
  if ((plan.technical?.ceilingDropM ?? 0) === drop) return state;

  const before = plan;
  const after: FloorPlan = { ...plan, technical: { ...plan.technical, points: plan.technical?.points ?? [], ceilingDropM: drop } };
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

  const electrical = state.electrical.map((point) => {
    const room = rooms.get(point.roomId);
    if (!room || ELECTRICAL_KINDS[point.kind].placement !== 'ceiling') return point;
    const height = ceilingHeightM(room, after);
    return near(point.elevationM, height) ? point : { ...point, elevationM: height };
  });

  const items = state.items.map((item) => {
    const room = rooms.get(item.roomId);
    if (!room) return item;
    const old = ceilingHeightM(room, before);
    const now = ceilingHeightM(room, after);
    const placement = getArchetype(item.kind)?.placement.type;
    // A pendant hung from the old ceiling hangs from the new one.
    if (placement === 'ceiling' && near(item.elevationM + item.size.height, old)) return { ...item, elevationM: Math.max(0, Math.round((now - item.size.height) * 100) / 100) };
    // A curtain run from just under the old ceiling runs from just under the new one.
    if (item.slot === 'curtain' && near(item.elevationM + item.size.height, old - CURTAIN_UNDER_CEILING_M)) return { ...item, size: { ...item.size, height: Math.round((now - CURTAIN_UNDER_CEILING_M - item.elevationM) * 100) / 100 } };
    return item;
  });

  // An air conditioner left at its usual height (hung from the ceiling down) follows the ceiling.
  const points = (after.technical?.points ?? []).map((point) => {
    const room = point.roomId ? rooms.get(point.roomId) : undefined;
    if (point.kind !== 'ac_unit' || !room) return point;
    const old = technicalElevation('ac_unit', underCeiling(room, before));
    return point.elevationM != null && near(point.elevationM, old) ? { ...point, elevationM: technicalElevation('ac_unit', underCeiling(room, after)) } : point;
  });

  return { plan: { ...after, technical: { ...after.technical!, points } }, items, electrical };
}
