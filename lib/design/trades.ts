/**
 * Which trades a project needs, from the labour lines of its budget.
 *
 * The budget's labour keys are the calculator's phases (`plastering`, `tiling`…) plus the
 * per-point work the studio counts (`electrical_point`, `plumbing_point`…); the workers'
 * directory knows six specialties. This is the map between the two, so the last step of the
 * journey can say "you need a tiler, an electrician and a plumber" and show them.
 */

import type { DesignCost } from './types';

export type TradeSlug = 'tiling' | 'painting' | 'plumbing' | 'electrical' | 'carpentry' | 'plastering';

export const TRADE_SLUGS: TradeSlug[] = ['plastering', 'tiling', 'plumbing', 'electrical', 'carpentry', 'painting'];

const LABOUR_TRADE: Record<string, TradeSlug> = {
  // Stripping out an old renovation (phase 0): the rough crew, a carpenter for the old
  // doors and windows, a plumber for the old sanitary ware.
  strip_floor: 'plastering',
  strip_walls: 'plastering',
  strip_ceiling: 'plastering',
  strip_tiles: 'plastering',
  remove_doors_windows: 'carpentry',
  remove_sanitary: 'plumbing',
  debris_removal: 'plastering',
  demolition: 'plastering',
  plumbing_rough: 'plumbing',
  electrical_rough: 'electrical',
  insulation: 'plastering',
  screed: 'plastering',
  plastering: 'plastering',
  waterproofing: 'tiling',
  tiling: 'tiling',
  windows: 'carpentry',
  doors: 'carpentry',
  flooring: 'carpentry',
  ceiling: 'plastering',
  painting: 'painting',
  electrical_finish: 'electrical',
  plumbing_finish: 'plumbing',
  electrical_point: 'electrical',
  lighting_point: 'electrical',
  plumbing_point: 'plumbing',
  radiator_install: 'plumbing',
  ac_install: 'electrical',
  extractor_install: 'electrical',
};

export interface TradeNeed {
  slug: TradeSlug;
  /** The labour keys that make up the need, with their totals. */
  lines: Array<{ key: string; total: number }>;
  total: number;
}

/** The trades the budget's labour lines call for, biggest first. */
export function tradesNeeded(cost: Pick<DesignCost, 'lines'>): TradeNeed[] {
  const byTrade = new Map<TradeSlug, TradeNeed>();
  for (const line of cost.lines) {
    if (line.section !== 'labour' || line.total <= 0) continue;
    const slug = LABOUR_TRADE[line.key];
    if (!slug) continue;
    const need = byTrade.get(slug) ?? { slug, lines: [], total: 0 };
    need.lines.push({ key: line.key, total: line.total });
    need.total = Math.round((need.total + line.total) * 100) / 100;
    byTrade.set(slug, need);
  }
  return [...byTrade.values()].sort((a, b) => b.total - a.total);
}
