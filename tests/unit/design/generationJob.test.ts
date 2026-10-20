import { describe, expect, it } from 'vitest';
import { generationAction, isStale, JOB_STALE_MS, type GenerationJobView, type GenerationStage } from '@/lib/design/generationJob';

/**
 * What the style page does with the server's generation job (`lib/design/generationJob`): wait on a
 * running one — also on a page opened again while it runs — read the design again when the server
 * has laid it out, and lay it out with the engine only when the job came to nothing.
 */

const started = '2026-10-21T10:00:00.000Z';
const job = (stage: GenerationStage, patch: Partial<GenerationJobView> = {}): GenerationJobView => ({ id: 7, stage, createdAt: started, stageAt: started, finishedAt: null, error: null, reviewed: null, ...patch });
const notLaidOut = { generated: false, generatedAt: null };

describe('a job that died with its function', () => {
  it('is stale past six minutes in a running stage, and never once it has ended', () => {
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
    expect(generationAction({ job: job('done', { error: 'REVIEW_TIMEOUT' }), designGenerated: true }, notLaidOut, false)).toBe('reload');
  });

  it('lays the flat out with the engine when the job it waits on comes to nothing', () => {
    expect(generationAction({ job: job('failed', { error: 'TIMEOUT' }), designGenerated: false }, notLaidOut, true)).toBe('engine');
    // The design changed under the check: the job ended without a laid-out flat.
    expect(generationAction({ job: job('done', { error: 'PROJECT_CHANGED' }), designGenerated: false }, notLaidOut, true)).toBe('engine');
    expect(generationAction({ job: null, designGenerated: false }, notLaidOut, true)).toBe('engine');
  });

  it('on opening, picks up a failed job newer than its flat, and leaves an old one as history', () => {
    expect(generationAction({ job: job('failed'), designGenerated: false }, notLaidOut, false)).toBe('engine');
    expect(generationAction({ job: job('failed'), designGenerated: false }, { generated: false, generatedAt: '2026-10-21T09:00:00.000Z' }, false)).toBe('engine');
    // The engine already laid a flat out after it (then emptied of its rooms and drawn again).
    expect(generationAction({ job: job('failed'), designGenerated: false }, { generated: false, generatedAt: '2026-10-21T10:05:00.000Z' }, false)).toBe('none');
    expect(generationAction({ job: job('done', { error: 'PROJECT_CHANGED' }), designGenerated: false }, notLaidOut, false)).toBe('none');
    expect(generationAction({ job: null, designGenerated: false }, notLaidOut, false)).toBe('none');
  });

  it('does nothing with a design already laid out in this browser', () => {
    for (const stage of ['designing', 'checking', 'done', 'failed'] as const) expect(generationAction({ job: job(stage), designGenerated: true }, { generated: true, generatedAt: started }, false)).toBe('none');
  });
});
