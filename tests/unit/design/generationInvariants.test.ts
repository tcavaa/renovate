import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareWithBaseline, measureGeneration, sortedCounts, type GenerationBaseline } from '../../helpers/generationAudit';
import { fixtureCatalog, fixturePlans, GENERATION_FIXTURES_DIR } from '../../helpers/generationFixtures';

/**
 * Whole flats, generated from real plans with the real catalogue (tests/fixtures/generation), and
 * held to a baseline: what the whole-flat check (`lib/design/sceneAudit`) finds in them may only go
 * down. A count that rises is a regression — fix it. One that falls is a fix — record it with
 * `pnpm audit:generation --write-baseline`, and the next change is held to the better number.
 * docs/design-studio/generation-audit.md lists what each count is and why it is not zero yet.
 */
describe('generating whole flats', () => {
  const baseline = JSON.parse(readFileSync(path.join(GENERATION_FIXTURES_DIR, 'baseline.json'), 'utf8')) as GenerationBaseline;
  const measure = measureGeneration(fixturePlans(), fixtureCatalog(), baseline.seeds);
  const moved = compareWithBaseline(measure.counts, baseline.counts);

  it('generates every fixture plan in every style', () => {
    expect(measure.flats).toBe(baseline.flats);
    expect(measure.rooms).toEqual(baseline.rooms);
  });

  it('is no worse than the baseline', () => {
    expect(moved.worse, 'generation got worse — see `pnpm audit:generation --examples`').toEqual([]);
  });

  it('has its improvements recorded', () => {
    expect(moved.better, 'generation got better — record it: `pnpm audit:generation --write-baseline`').toEqual([]);
  });

  it('keeps what was fixed at zero', () => {
    // Fixed once, never again: add a metric here in the commit that takes it to zero.
    const fixed: string[] = ['socket_in_radiator', 'rule:socket_in_splash', 'two_main_lights', 'missing:living_room:sofa'];
    const counts = sortedCounts(measure.counts);
    for (const metric of fixed) expect(counts[metric] ?? 0, metric).toBe(0);
    // Nothing is left arranged round a piece that is not there (`lib/design/arrangedOff`).
    expect(Object.keys(counts).filter((metric) => metric.startsWith('orphan:'))).toEqual([]);
  });
});
