import { describe, expect, it } from 'vitest';
import { calculatorResumeStep, designResumeStep, type DesignResumeInput } from '@/lib/flow/resume';

/**
 * Where a project reopens: the page that was open when it was left, when that page can still
 * be shown — else the nearest one that can, back before forward, in the project's own order.
 */

describe('calculatorResumeStep', () => {
  const base = { at: null, step: 1, calculated: false, homeState: 'white_frame' as const, roomCount: 3, hasBoard: true };

  it('opens a project with no home state on the first step, wherever it was', () => {
    expect(calculatorResumeStep({ ...base, homeState: null, at: 5, step: 7 })).toBe(1);
  });

  it('before the calculation, only the way in and the plan are open', () => {
    expect(calculatorResumeStep({ ...base, at: 2, step: 2 })).toBe(2);
    expect(calculatorResumeStep({ ...base, at: 1, step: 2 })).toBe(1);
    // A later page recorded somehow (an old save) still lands on the plan.
    expect(calculatorResumeStep({ ...base, at: 5, step: 5 })).toBe(2);
    // No board to show on the plan step: the way in.
    expect(calculatorResumeStep({ ...base, at: 2, step: 2, hasBoard: false })).toBe(1);
  });

  it('after the calculation, steps 1 and 2 are shut and the page last open is where it opens', () => {
    const calculated = { ...base, calculated: true, step: 6 };
    expect(calculatorResumeStep({ ...calculated, at: 4 })).toBe(4);
    expect(calculatorResumeStep({ ...calculated, at: 6 })).toBe(6);
    expect(calculatorResumeStep({ ...calculated, at: 1 })).toBe(3);
    expect(calculatorResumeStep({ ...calculated, at: 2 })).toBe(3);
  });

  it('never opens beyond how far the journey got, and falls back to it when nothing was recorded', () => {
    expect(calculatorResumeStep({ ...base, calculated: true, step: 4, at: 7 })).toBe(4);
    expect(calculatorResumeStep({ ...base, calculated: true, step: 6, at: null })).toBe(6);
  });
});

describe('designResumeStep', () => {
  // A renovation walks [1, 2, 4, 5, 6, 3, 7, 8]; a design-only project [1..8].
  const renovation: DesignResumeInput = { at: null, step: 1, generated: false, planFromCalculator: false, modeChosen: true, homeState: 'black_frame', mode: 'full', roomCount: 4 };
  const designOnly: DesignResumeInput = { ...renovation, homeState: null, mode: 'design_only' };

  it('opens on the page last open when it can be shown', () => {
    expect(designResumeStep({ ...designOnly, step: 3, at: 3 })).toBe(3);
    expect(designResumeStep({ ...renovation, generated: true, step: 7, at: 7 })).toBe(7);
    expect(designResumeStep({ ...renovation, generated: true, step: 6, at: 6 })).toBe(6);
  });

  it('once laid out, everything before the studio is shut — but the technical step after it in a renovation is open', () => {
    expect(designResumeStep({ ...renovation, generated: true, step: 5, at: 2 })).toBe(5);
    expect(designResumeStep({ ...renovation, generated: true, step: 3, at: 3 })).toBe(3);
    expect(designResumeStep({ ...designOnly, generated: true, step: 5, at: 3 })).toBe(5);
  });

  it('never opens past the studio before the flat is laid out', () => {
    expect(designResumeStep({ ...renovation, step: 7, at: 7 })).toBe(4);
    expect(designResumeStep({ ...designOnly, step: 5, at: 5 })).toBe(4);
  });

  it('keeps the plan steps shut for a flat drawn in the calculator', () => {
    expect(designResumeStep({ ...renovation, planFromCalculator: true, step: 4, at: 2 })).toBe(4);
    expect(designResumeStep({ ...renovation, planFromCalculator: true, step: 4, at: 4 })).toBe(4);
  });

  it('opens nothing after step 1 before step 1 has been answered', () => {
    expect(designResumeStep({ ...designOnly, modeChosen: false, step: 2, at: 2 })).toBe(1);
  });

  it('needs rooms for the technical step and the style test', () => {
    expect(designResumeStep({ ...designOnly, roomCount: 0, step: 4, at: 4 })).toBe(2);
  });

  it('treats a flat laid out and then emptied of every room as not laid out', () => {
    expect(designResumeStep({ ...designOnly, generated: true, roomCount: 0, step: 5, at: 5 })).toBe(2);
  });

  it('falls back to how far the journey got when nothing was recorded', () => {
    expect(designResumeStep({ ...designOnly, step: 3, at: null })).toBe(3);
  });

  it('opens the board a flat was left half drawn on, before any "next" recorded the step', () => {
    expect(designResumeStep({ ...designOnly, step: 1, at: 2, roomCount: 0 })).toBe(2);
    expect(designResumeStep({ ...designOnly, step: 1, at: 2 })).toBe(2);
  });
});
