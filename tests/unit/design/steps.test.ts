import { describe, expect, it } from 'vitest';
import { designStepCount, designStepOrder, designStepPosition, nextStep, previousStep, walkedStep } from '@/lib/design/steps';

describe('the order of the design steps', () => {
  it('walks a renovation Plan · Existing home · Style · 3D · Budget · Brigade: Materials and Technical are the studio\'s sections', () => {
    expect(designStepOrder('black_frame', 'full')).toEqual([1, 2, 4, 5, 7, 8]);
    expect(designStepCount('white_frame', 'full')).toBe(6);
    // The studio's sections stand where the studio does.
    expect(walkedStep(6, 'black_frame', 'full')).toBe(5);
    expect(walkedStep(3, 'black_frame', 'full')).toBe(5);
    expect(designStepPosition(3, 'black_frame', 'full')).toBe(designStepPosition(5, 'black_frame', 'full'));
    // From the studio, and from either of its sections, on to the budget; back from the budget to the studio.
    expect(nextStep(5, 'black_frame', 'full')).toBe(7);
    expect(nextStep(6, 'black_frame', 'full')).toBe(7);
    expect(nextStep(3, 'black_frame', 'full')).toBe(7);
    expect(previousStep(7, 'black_frame', 'full')).toBe(5);
    expect(nextStep(2, 'black_frame', 'full')).toBe(4);
  });

  it('keeps Technical a step of its own, before the style, for a finished home or a design only', () => {
    expect(designStepOrder('green_frame', 'full')).toEqual([1, 2, 3, 4, 5, 7, 8]);
    expect(designStepOrder(null, 'design_only')).toEqual([1, 2, 3, 4, 5, 7, 8]);
    expect(walkedStep(3, 'green_frame', 'full')).toBe(3);
    expect(nextStep(2, 'green_frame', 'full')).toBe(3);
    expect(nextStep(3, 'green_frame', 'full')).toBe(4);
    expect(nextStep(5, null, 'design_only')).toBe(7);
    expect(designStepCount(null, 'design_only')).toBe(7);
  });
});
