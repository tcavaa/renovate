import { electricalLabel, technicalLabel } from '@/components/plan/PlanToolbar';
import { materialLabel, workTypeLabel } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n';
import type { BudgetLine } from '@/lib/design/pricing';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';

/**
 * What a budget line is called, in the reader's language. A product carries its own name;
 * everything the engine works out itself is a key the dictionaries translate — a bag of
 * plaster, an hour of plastering, "12 × socket", a door nobody has chosen yet.
 */
export function budgetLineName(t: Dictionary, line: Pick<BudgetLine, 'key' | 'section' | 'name'>): string {
  // The kind of line first, the shape of its key second: `electric_point` and
  // `plumbing_install` are labour, not a kind of fitting or pipe, and read by their
  // prefix they came out as a row with no name at all.
  if (line.section === 'labour') return workTypeLabel(t, line.key);
  if (line.section === 'materials') return materialLabel(t, line.key);
  if (line.key.startsWith('electrical_')) return electricalLabel(t, line.key.slice('electrical_'.length) as ElectricalKind);
  if (line.key.startsWith('technical_')) return technicalLabel(t, line.key.slice('technical_'.length) as TechnicalKind);
  if (line.key === 'window') return t.build.lineWindow;
  if (line.key === 'door') return t.build.lineDoor;
  if (line.key === 'entrance_door') return t.build.lineEntranceDoor;
  if (line.key === 'kitchen_run_custom') return t.build.lineKitchenRun;
  if (line.key === 'kitchen_island_custom') return t.build.lineKitchenIsland;
  return line.name ?? line.key;
}
