/**
 * Where a project opens.
 *
 * A project reopens on the page that was open when it was left (`at`, recorded as the person
 * moves between steps and saved with the project) — provided that page can still be shown:
 * it is not shut behind the journey's hinge, and it has what it needs to show something
 * rather than "finish the previous step first". Otherwise it opens on the nearest step that
 * can, looking back from where the person was before looking forward. Pure, so the rules are
 * tested without a browser (`tests/unit/flow/resume.test.ts`).
 */

import type { CalculatorStepNumber, HomeState } from '@/lib/calculator/types';
import { CALCULATOR_STEPS } from '@/lib/calculator/steps';
import type { DesignMode } from '@/lib/design/types';
import type { StudioStep } from '@/store/designStore';
import { designStepOrder } from '@/lib/design/steps';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

export interface CalculatorResumeInput {
  /** The page last open, if it was recorded. */
  at: number | null;
  /** How far the journey got. */
  step: number;
  /** "Start the calculation" was pressed: steps 1 and 2 are shut. */
  calculated: boolean;
  homeState: HomeState | null;
  roomCount: number;
  /** The drawing board has a plan (even a blank sheet): the plan step has something to show. */
  hasBoard: boolean;
}

export function calculatorResumeStep(p: CalculatorResumeInput): CalculatorStepNumber {
  // Nothing past the first step means anything before the home's condition is known.
  if (!p.homeState) return 1;
  const target = clamp(p.at ?? p.step, 1, CALCULATOR_STEPS);
  // Not calculated yet: the way in and the plan are all there is.
  if (!p.calculated) return target >= 2 && p.hasBoard ? 2 : 1;
  // Calculated: steps 1 and 2 are shut, and nothing beyond how far the journey got.
  return clamp(target, 3, Math.max(3, p.step)) as CalculatorStepNumber;
}

export interface DesignResumeInput {
  at: number | null;
  step: number;
  /** Laid out (or started empty): everything before the studio is shut. */
  generated: boolean;
  /** Drawn in the calculator: steps 1 and 2 are shut. */
  planFromCalculator: boolean;
  /** Step 1's "what do you need" was answered; nothing after it opens before. */
  modeChosen: boolean;
  homeState: HomeState | null;
  mode: DesignMode;
  roomCount: number;
}

export function designResumeStep(p: DesignResumeInput): StudioStep {
  const order = designStepOrder(p.homeState, p.mode);
  const studio = order.indexOf(5);
  // A flat laid out and then emptied of every room has nothing for the studio to show: it is
  // back before the layout, where a plan can be drawn again.
  const generated = p.generated && p.roomCount > 0;
  const valid = (s: StudioStep): boolean => {
    const pos = order.indexOf(s);
    if (generated) return pos >= studio;
    // Nothing after step 1 before it has been answered (a flat drawn in the calculator answered it there).
    if (!p.modeChosen && !p.planFromCalculator && s !== 1) return false;
    // Never past the studio before the flat has been laid out.
    if (pos >= studio) return false;
    if (p.planFromCalculator && (s === 1 || s === 2)) return false;
    // The technical step and the style test need rooms to work on.
    if (s === 3 || s === 4) return p.roomCount > 0;
    return true;
  };
  // `at` is only ever a page that was open, so it is trusted as far as the page can still be
  // shown — the design records `step` on its "next" buttons, and a flat left half drawn on the
  // board has `step` 1 and `at` 2.
  const target = clamp(p.at ?? p.step, 1, 8) as StudioStep;
  if (valid(target)) return target;
  const pos = order.indexOf(target);
  for (let i = pos - 1; i >= 0; i--) if (valid(order[i])) return order[i];
  for (let i = pos + 1; i < order.length; i++) if (valid(order[i])) return order[i];
  return generated ? 5 : 1;
}
