/**
 * The generator run over the fixture plans — every style, a number of seeds — and each finished
 * flat checked as a whole (`lib/design/sceneAudit`): what `pnpm audit:generation` prints and what
 * tests/unit/design/generationInvariants.test.ts holds to its baseline.
 */

import { generateScene, type GeneratedScene } from '../../lib/design/generateScene';
import { auditScene, issueMetric, type SceneIssue } from '../../lib/design/sceneAudit';
import { streamRng } from '../../lib/design/random';
import { STYLE_IDS } from '../../lib/design/styles';
import type { CatalogProduct } from '../../lib/design/matcher';
import type { FloorPlan, StyleId } from '../../lib/design/types';
import type { FixturePlan } from './generationFixtures';

/** One flat of the run: the n-th draw of a plan in a style. */
export interface GenerationRun {
  planId: string;
  styleId: StyleId;
  /** 1, 2, 3… — the seed and the budget follow from it, so a run can be named and made again. */
  n: number;
}

/**
 * The seed of a plan's n-th run: n × 1000 + 7 mixed with the plan's id (`streamRng`), below 2³¹ like
 * `randomSeed`. Each room draws from streams keyed by its id, and the fixture plans reuse ids (r2 is
 * a room in 15 of them): one seed for every plan would draw every room of an id the same numbers in
 * every plan, and the audit would sample far fewer draws than it has flats. A plan's four styles
 * share its seed, as they always have.
 */
export const runSeed = (planId: string, n: number) => Math.floor(streamRng(n * 1000 + 7, `audit:${planId}`)() * 2 ** 31);
/** The budget of the n-th run: none, a generous one, a tight one — in turn. */
export const runBudget = (n: number): number | null => (n % 3 === 1 ? null : n % 3 === 2 ? 10_000_000 : 2500);
export const runName = (run: GenerationRun) => `${run.planId}/${run.styleId}/${run.n}`;

/** The flat the app generates for a plan, a style and a draw, with no AI designer. */
export function generatedFlat(planId: string, plan: FloorPlan, catalog: CatalogProduct[], styleId: StyleId, n: number): GeneratedScene {
  return generateScene({ plan, styleId, budgetGel: runBudget(n), catalog, proposal: null, finishes: [], electrical: [], seed: runSeed(planId, n), at: '2026-11-16T00:00:00.000Z', aiCount: 0 });
}

export interface GenerationMeasure {
  flats: number;
  /** Rooms generated, by type: what a count of `missing:bathroom:…` is out of. */
  rooms: Record<string, number>;
  /** How many of each issue (`issueMetric`). */
  counts: Record<string, number>;
  /** Where to look: the first few of each, as `plan/style/n room: what`. */
  examples: Record<string, string[]>;
}

/** Generates every plan in every style, `seeds` draws each, and tallies what the whole-flat check finds. */
export function measureGeneration(plans: readonly FixturePlan[], catalog: CatalogProduct[], seeds = 1, each?: (run: GenerationRun, scene: GeneratedScene, issues: SceneIssue[]) => void): GenerationMeasure {
  const measure: GenerationMeasure = { flats: 0, rooms: {}, counts: {}, examples: {} };
  for (const { id: planId, plan } of plans) {
    for (const styleId of STYLE_IDS) {
      for (let n = 1; n <= seeds; n++) {
        const run = { planId, styleId, n };
        const scene = generatedFlat(planId, plan, catalog, styleId, n);
        const issues = auditScene(scene);
        measure.flats++;
        for (const room of scene.plan.rooms) measure.rooms[room.type] = (measure.rooms[room.type] ?? 0) + 1;
        for (const issue of issues) {
          const metric = issueMetric(issue);
          measure.counts[metric] = (measure.counts[metric] ?? 0) + 1;
          const examples = (measure.examples[metric] ??= []);
          if (examples.length < 5) examples.push(`${runName(run)} ${issue.roomId ?? 'flat'}: ${issue.what}`);
        }
        each?.(run, scene, issues);
      }
    }
  }
  return measure;
}

/** The counts in a fixed order, zeroes left out: what is written to the baseline and compared with it. */
export function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

export interface GenerationBaseline {
  /** Draws per plan and style the baseline was taken with. */
  seeds: number;
  flats: number;
  rooms: Record<string, number>;
  counts: Record<string, number>;
}

/** What moved against a baseline: `worse` must be explained, `better` recorded. */
export function compareWithBaseline(counts: Record<string, number>, baseline: Record<string, number>): { worse: string[]; better: string[] } {
  const worse: string[] = [];
  const better: string[] = [];
  for (const metric of [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort()) {
    const now = counts[metric] ?? 0;
    const was = baseline[metric] ?? 0;
    if (now > was) worse.push(`${metric}: ${was} → ${now}`);
    if (now < was) better.push(`${metric}: ${was} → ${now}`);
  }
  return { worse, better };
}
