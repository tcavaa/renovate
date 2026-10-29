/**
 * The lighting plan in the reader's words, for the plan PDF's lighting sheet: a row per kind of
 * fitting in each room — what it is, what it lights, where it is fixed and how high, how many
 * (`lightingPlan`).
 */

import type { Dictionary } from '@/lib/i18n';
import { archetypeLabel } from '@/lib/design/catalog';
import { lightingPlan, type LightingMount } from '@/lib/design/lightingPlan';
import type { ElectricalPoint, FloorPlan, LightCategory, PlacedItem } from '@/lib/design/types';
import { electricalLabel } from './PlanToolbar';

export interface LightingSheet {
  title: string;
  header: string[];
  rows: string[][];
}

const PURPOSE_KEY: Record<LightCategory, keyof Dictionary['build']> = { primary: 'lcPrimary', secondary: 'lcSecondary', furniture: 'lcFurniture', bedside: 'lcBedside', indirect: 'lcIndirect', decorative: 'lcDecorative' };
const MOUNT_KEY: Record<LightingMount, keyof Dictionary['build']> = { ceiling: 'lightMountCeiling', wall: 'lightMountWall', hanging: 'lightMountHanging', floor: 'lightMountFloor' };

/** The sheet's heading, columns and rows; null for a plan with no light anywhere. */
export function lightingSheet(t: Dictionary, locale: 'ka' | 'en' | 'ru', plan: FloorPlan, items: PlacedItem[], electrical: ElectricalPoint[]): LightingSheet | null {
  const rooms = lightingPlan(plan, items, electrical);
  if (rooms.length === 0) return null;
  const rows: string[][] = [];
  for (const room of rooms) {
    room.rows.forEach((row, i) => {
      const fixture = row.fixture === 'pendant' || row.fixture === 'floor_lamp' ? archetypeLabel(row.fixture, locale) : electricalLabel(t, row.fixture);
      rows.push([i === 0 ? room.roomName : '', fixture, t.build[PURPOSE_KEY[row.purpose]], `${t.build[MOUNT_KEY[row.mount]]} · ${row.heightM.toFixed(2)} ${t.units.m}`, String(row.count)]);
    });
  }
  return {
    title: t.build.lightingPlanTitle,
    header: [t.build.lightingColRoom, t.build.lightingColFixture, t.build.lightingColPurpose, t.build.lightingColHeight, t.build.lightingColCount],
    rows,
  };
}
