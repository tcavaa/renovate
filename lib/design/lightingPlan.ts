/**
 * The lighting plan: every room's light fittings — what each is, what it lights, where it is
 * fixed and how high (the owner's notes of 29 Oct 2026: "a dedicated lighting plan that
 * identifies the fixture type, position, purpose and recommended height for each room"). The
 * lights are the electrical layer's light points (ceiling lights, spots, wall lights, strips,
 * the light under the wall cabinets) and the furniture that is a lamp (a pendant, a floor lamp).
 * It is listed on the plan PDF's lighting sheet; the board shows the same fittings on its
 * Lighting layer.
 *
 * Pure: no React, no DOM.
 */

import { ELECTRICAL_KINDS, isLight } from './electrical';
import { ceilingHeightM } from './rules';
import type { ElectricalKind, ElectricalPoint, FloorPlan, LightCategory, PlacedItem } from './types';

/** A light fitting of the plan: an electrical light point's kind, or a lamp that is furniture. */
export type LightingFixture = ElectricalKind | 'pendant' | 'floor_lamp';

/** Where a fitting is fixed: on the ceiling, on a wall, hanging from the ceiling, standing on the floor. */
export type LightingMount = 'ceiling' | 'wall' | 'hanging' | 'floor';

export interface LightingRow {
  fixture: LightingFixture;
  purpose: LightCategory;
  mount: LightingMount;
  /** The fitting's height above the floor, metres: a ceiling's height, a wall light's, a pendant's shade, a floor lamp's top. */
  heightM: number;
  count: number;
}

export interface LightingRoom {
  roomId: string;
  roomName: string;
  rows: LightingRow[];
}

const LAMP_SLOTS = new Set(['pendant', 'floor_lamp']);

/** Each room's fittings, the same kind at the same height and for the same purpose counted together; rooms with none left out. */
export function lightingPlan(plan: FloorPlan, items: PlacedItem[], electrical: ElectricalPoint[]): LightingRoom[] {
  const out: LightingRoom[] = [];
  for (const room of plan.rooms) {
    const rows: LightingRow[] = [];
    const add = (row: Omit<LightingRow, 'count'>) => {
      const heightM = Math.round(row.heightM * 100) / 100;
      const same = rows.find((r) => r.fixture === row.fixture && r.purpose === row.purpose && r.mount === row.mount && Math.abs(r.heightM - heightM) < 0.005);
      if (same) same.count += 1;
      else rows.push({ ...row, heightM, count: 1 });
    };
    const ceiling = ceilingHeightM(room, plan);
    for (const point of electrical) {
      if (point.roomId !== room.id || !isLight(point.kind)) continue;
      const info = ELECTRICAL_KINDS[point.kind];
      const onCeiling = info.placement === 'ceiling';
      add({ fixture: point.kind, purpose: point.category ?? info.category ?? 'primary', mount: onCeiling ? 'ceiling' : 'wall', heightM: onCeiling ? ceiling : (point.elevationM ?? info.defaultElevationM) });
    }
    const tables = items.filter((i) => i.roomId === room.id && (i.slot === 'dining_table' || i.slot === 'kitchen_island'));
    for (const item of items) {
      if (item.roomId !== room.id || !LAMP_SLOTS.has(item.slot)) continue;
      if (item.slot === 'pendant') {
        // Over a table it lights the table; else it is the room's main light.
        const overTable = tables.some((t) => Math.hypot(t.position.x - item.position.x, t.position.z - item.position.z) < 0.5);
        add({ fixture: 'pendant', purpose: overTable ? 'furniture' : 'primary', mount: 'hanging', heightM: item.elevationM });
      } else {
        add({ fixture: 'floor_lamp', purpose: 'secondary', mount: 'floor', heightM: item.size.height });
      }
    }
    if (rows.length > 0) out.push({ roomId: room.id, roomName: room.name, rows });
  }
  return out;
}
