/**
 * A design-rule warning (`lib/design/ruleChecks.ts`) in the person's words: the technical step's
 * hints, the studio's warnings list and anything else that shows them say it the same way.
 */

import { fill } from '@/lib/admin/list';
import { archetypeLabel } from '@/lib/design/catalog';
import { ruleViolations, type RuleViolation } from '@/lib/design/ruleChecks';
import type { ElectricalPoint, FloorPlan, PlacedItem } from '@/lib/design/types';
import type { Dictionary, Locale } from '@/lib/i18n';

export function ruleText(t: Dictionary, locale: Locale, plan: FloorPlan, items: PlacedItem[], v: RuleViolation): string {
  const room = plan.rooms.find((r) => r.id === v.roomId)?.name ?? '';
  const item = v.itemId ? archetypeLabel(items.find((i) => i.id === v.itemId)?.kind ?? '', locale) : '';
  const cm = (m: number | undefined) => Math.round((m ?? 0) * 100);
  const n = cm(v.valueM);
  const min = cm(v.limitM);
  switch (v.code) {
    case 'radiator_blocked':
      return fill(t.build.sgRadiatorBlocked, { room, item });
    case 'radiator_under_sill':
      return fill(t.build.sgRadiatorUnderSill, { room, n });
    case 'boiler_not_exterior':
      return fill(t.build.sgBoilerNotExterior, { room });
    case 'boiler_by_bath':
      return fill(t.build.sgBoilerByBath, { room });
    case 'door_too_narrow':
      return fill(t.build.sgDoorTooNarrow, { room, n, min });
    case 'door_swing_clash':
      return fill(t.build.sgDoorSwingClash, { room });
    case 'door_swing_blocked':
      return fill(t.build.sgDoorSwingBlocked, { room, item });
    case 'wc_faces_door':
      return fill(t.build.sgWcFacesDoor, { room });
    case 'kitchen_faces_entrance':
      return fill(t.build.sgKitchenFacesEntrance, { room });
    case 'bed_side_tight':
      return fill(t.build.sgBedSideTight, { room, n });
    case 'sofa_tv_distance':
      return fill(t.build.sgSofaTvDistance, { room, m: (v.valueM ?? 0).toFixed(1) });
    case 'counters_too_close':
      return fill(t.build.sgCountersTooClose, { room, n });
    case 'shower_too_small':
      return fill(t.build.sgShowerTooSmall, { room, n });
    case 'wc_side_tight':
      return fill(t.build.sgWcSideTight, { room, n });
    case 'basin_height':
      return fill(t.build.sgBasinHeight, { room, n });
    case 'socket_in_splash':
      return fill(t.build.sgSocketInSplash, { room, item });
  }
}

/** Every warning of the flat, in the person's words — what the plan PDF lists under the sheet. */
export function ruleNotes(t: Dictionary, locale: Locale, plan: FloorPlan, items: PlacedItem[], electrical: ElectricalPoint[] = []): string[] {
  return ruleViolations(plan, items, electrical).map((v) => ruleText(t, locale, plan, items, v));
}
