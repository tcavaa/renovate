import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aiFallback,
  DESIGN_DEADLINE_MS,
  FUNCTION_MAX_MS,
  generationAction,
  isStale,
  JOB_MAX_MINUTES,
  JOB_STALE_MS,
  REVIEW_DEADLINE_MS,
  REVIEW_START_MS,
  startRefusal,
  type GenerationJobView,
  type GenerationStage,
} from '@/lib/design/generationJob';

/**
 * What the style page does with the server's generation job (`lib/design/generationJob`): wait on a
 * running one — also on a page opened again while it runs — read the design again when the server
 * has laid it out, and lay it out with the engine only when the job came to nothing.
 */

const started = '2026-10-21T10:00:00.000Z';
const job = (stage: GenerationStage, patch: Partial<GenerationJobView> = {}): GenerationJobView => ({ id: 7, stage, createdAt: started, stageAt: started, finishedAt: null, error: null, reviewed: null, ...patch });
const notLaidOut = { generated: false };

describe('a job that died with its function', () => {
  it('is taken for dead as soon as the function running its stage can no longer be alive', () => {
    // The two stages' functions live as long as their routes say.
    for (const route of ['app/api/design/ai-generate/route.ts', 'app/api/design/ai-review/route.ts']) {
      const seconds = Number(/export const maxDuration = (\d+);/.exec(readFileSync(join(process.cwd(), route), 'utf8'))?.[1]);
      expect(seconds * 1000).toBe(FUNCTION_MAX_MS);
    }
    // The check's function starts at most as late as its request is waited for, and the designer
    // and the check are let go well inside their functions.
    expect(JOB_STALE_MS).toBe(FUNCTION_MAX_MS + REVIEW_START_MS);
    expect(DESIGN_DEADLINE_MS).toBeLessThan(FUNCTION_MAX_MS);
    expect(REVIEW_DEADLINE_MS).toBeLessThan(FUNCTION_MAX_MS);
    const at = (ms: number) => new Date(Date.parse(started) + ms);
    // A function dead after 300 s used to keep the overlay up to six minutes.
    expect(isStale({ stage: 'designing', stageAt: started }, at(JOB_STALE_MS + 1000))).toBe(true);
    expect(isStale({ stage: 'checking', stageAt: started }, at(6 * 60_000 - 1000))).toBe(true);
    // The hint's longest wait: both stages to their end.
    expect(JOB_MAX_MINUTES).toBe(Math.ceil((2 * JOB_STALE_MS) / 60_000));
  });

  it('is stale past its time in a running stage, and never once it has ended', () => {
    const at = (ms: number) => new Date(Date.parse(started) + ms);
    expect(isStale({ stage: 'designing', stageAt: started }, at(JOB_STALE_MS - 1000))).toBe(false);
    expect(isStale({ stage: 'designing', stageAt: started }, at(JOB_STALE_MS + 1000))).toBe(true);
    expect(isStale({ stage: 'checking', stageAt: started }, at(JOB_STALE_MS + 1000))).toBe(true);
    expect(isStale({ stage: 'done', stageAt: started }, at(60 * 60_000))).toBe(false);
    expect(isStale({ stage: 'failed', stageAt: started }, at(60 * 60_000))).toBe(false);
  });
});

describe('the style page', () => {
  it('waits on a job designing or checking — the one it started, or one it finds running when the project opens again', () => {
    for (const waiting of [true, false]) {
      expect(generationAction({ job: job('designing'), designGenerated: false }, notLaidOut, waiting)).toBe('wait');
      expect(generationAction({ job: job('checking'), designGenerated: false }, notLaidOut, waiting)).toBe('wait');
    }
  });

  it('reads the design again once the server has laid it out — also after the tab was closed', () => {
    expect(generationAction({ job: job('done'), designGenerated: true }, notLaidOut, true)).toBe('reload');
    expect(generationAction({ job: job('done'), designGenerated: true }, notLaidOut, false)).toBe('reload');
    // A check that timed out was settled on the server: the flat is laid out, unchecked.
    expect(generationAction({ job: job('done', { error: 'check:TIMEOUT' }), designGenerated: true }, notLaidOut, false)).toBe('reload');
  });

  it('lays the flat out with the engine when the job it waits on comes to nothing', () => {
    expect(generationAction({ job: job('failed', { error: 'design:TIMEOUT' }), designGenerated: false }, notLaidOut, true)).toBe('engine');
    // The design changed under the check: the job ended without a laid-out flat.
    expect(generationAction({ job: job('done', { error: 'PROJECT_CHANGED' }), designGenerated: false }, notLaidOut, true)).toBe('engine');
    expect(generationAction({ job: null, designGenerated: false }, notLaidOut, true)).toBe('engine');
  });

  it('on a later visit lays nothing out for a job that came to nothing: the flat waits for the person’s press', () => {
    // However recent: the visit that started it was the one to lay it out.
    expect(generationAction({ job: job('failed', { error: 'design:TIMEOUT' }), designGenerated: false }, notLaidOut, false)).toBe('none');
    expect(generationAction({ job: job('failed', { error: 'design:CHANGED' }), designGenerated: false }, notLaidOut, false)).toBe('none');
    expect(generationAction({ job: job('done', { error: 'check:PROJECT_CHANGED' }), designGenerated: false }, notLaidOut, false)).toBe('none');
    expect(generationAction({ job: null, designGenerated: false }, notLaidOut, false)).toBe('none');
  });

  it('does nothing with a design already laid out in this browser', () => {
    for (const stage of ['designing', 'checking', 'done', 'failed'] as const) expect(generationAction({ job: job(stage), designGenerated: true }, { generated: true }, false)).toBe('none');
  });
});

describe('what the person is told when the AI designer did not design the flat', () => {
  it('says why a job ended with the engine’s flat — the design changed, or a failure — and nothing when the designer’s flat was laid out', () => {
    expect(aiFallback(job('done', { error: 'design:AI_FAILED Error: 529 overloaded' }))).toBe('failed');
    expect(aiFallback(job('failed', { error: 'design:TIMEOUT' }))).toBe('failed');
    expect(aiFallback(job('failed', { error: 'design:ERROR TypeError: x' }))).toBe('failed');
    expect(aiFallback(job('failed', { error: 'design:CHANGED' }))).toBe('changed');
    expect(aiFallback(job('failed', { error: 'design:PROJECT_CHANGED' }))).toBe('changed');
    // A write the plan's locks refused: the plan's, not a failure (decision 10a).
    expect(aiFallback(job('failed', { error: 'design:PLAN_REQUIRED catalog' }))).toBe('plan');
    // No job, and the page lays the flat out with the engine: the run it waited on is gone.
    expect(aiFallback(null, false)).toBe('failed');
    // No job, and the server's flat laid out (another tab's engine flat, a deployment with no
    // key): no AI was asked for, so there is nothing to say.
    expect(aiFallback(null)).toBeNull();
    // The designer's flat, checked or not: nothing to say.
    expect(aiFallback(job('done'))).toBeNull();
    expect(aiFallback(job('done', { error: 'check:TIMEOUT' }))).toBeNull();
    expect(aiFallback(job('done', { error: 'check:AI_FAILED Error: overloaded' }))).toBeNull();
    // Nothing laid out on the server (the page lays the flat out): a check's ending says why too.
    expect(aiFallback(job('done', { error: 'check:CHANGED' }), false)).toBe('changed');
    expect(aiFallback(job('failed', { error: 'check:ERROR TypeError: x' }), false)).toBe('failed');
  });

  it('says why a start was refused: the design’s AI runs used up, too many asked in a short while, the design changed, or a failure', () => {
    expect(startRefusal(429, 'AI_LIMIT')).toBe('limit');
    expect(startRefusal(429, 'AI_PAUSED')).toBe('paused');
    // The start route's own rate limit.
    expect(startRefusal(429, 'Too many requests — please try again later')).toBe('paused');
    expect(startRefusal(409, 'PROJECT_CHANGED')).toBe('changed');
    // The plan's locks: the plan does not include it — told plainly, never as a failure (decision 10a).
    expect(startRefusal(402, 'PLAN_REQUIRED')).toBe('plan');
    expect(startRefusal(503, 'AI_UNAVAILABLE')).toBe('failed');
    expect(startRefusal(0, null)).toBe('failed');
  });
});
