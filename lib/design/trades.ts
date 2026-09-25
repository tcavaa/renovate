/**
 * Which trades a project needs, from the labour lines of its budget.
 *
 * The budget's labour keys are the renovation team's works (`plaster_walls`, `bath_tiling`…),
 * the per-point ones included (`electric_point`, `plumbing_install`…); the workers'
 * directory knows six specialties. This is the map between the two, so the last step of the
 * journey can say "you need a tiler, an electrician and a plumber" and show them.
 */

import type { DesignCost } from './types';

export type TradeSlug = 'tiling' | 'painting' | 'plumbing' | 'electrical' | 'carpentry' | 'plastering';

export const TRADE_SLUGS: TradeSlug[] = ['plastering', 'tiling', 'plumbing', 'electrical', 'carpentry', 'painting'];

const LABOUR_TRADE: Record<string, TradeSlug> = {
  // Stripping out an old renovation (phase 0) and carrying the rubbish out: the rough crew.
  demolish_floor: 'plastering',
  demolish_walls: 'plastering',
  demolish_tiles: 'plastering',
  debris_old: 'plastering',
  debris_new: 'plastering',
  wall_build: 'plastering',
  heating_piping: 'plumbing',
  radiator_mount: 'plumbing',
  floor_screed: 'plastering',
  electric_point: 'electrical',
  wall_chasing: 'electrical',
  plaster_walls: 'plastering',
  paint_walls: 'painting',
  plumbing_install: 'plumbing',
  bath_screed: 'tiling',
  bath_wall_prep: 'tiling',
  bath_tiling: 'tiling',
  kitchen_tiling: 'tiling',
  laminate_laying: 'carpentry',
  parquet_laying: 'carpentry',
  ceiling_gypsum: 'plastering',
  ceiling_finish: 'painting',
  ceiling_barisol: 'plastering',
  door_install: 'carpentry',
  trim_install: 'carpentry',
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
    // Work the person ticked off the budget is work they are not hiring anybody for.
    if (line.section !== 'labour' || line.total <= 0 || line.excluded) continue;
    const slug = LABOUR_TRADE[line.key];
    if (!slug) continue;
    const need = byTrade.get(slug) ?? { slug, lines: [], total: 0 };
    need.lines.push({ key: line.key, total: line.total });
    need.total = Math.round((need.total + line.total) * 100) / 100;
    byTrade.set(slug, need);
  }
  return [...byTrade.values()].sort((a, b) => b.total - a.total);
}
