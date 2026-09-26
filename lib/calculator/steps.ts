/**
 * Where the calculator's six steps live. Every one of them is inside a project
 * (`/calculator/<id>/<path>`); `/calculator` itself is the hub — what the calculator does and
 * the person's projects — and `/calculator/<id>` opens a project where it was left
 * (`lib/flow/resume`).
 */

import type { CalculatorStepNumber } from '@/lib/calculator/types';

export const CALCULATOR_HUB_HREF = '/calculator';

export const CALCULATOR_STEPS = 6;

export const CALCULATOR_STEP_PATHS: Record<CalculatorStepNumber, string> = {
  1: 'start',
  2: 'plan',
  3: 'materials',
  4: 'catalog',
  5: 'furniture',
  6: 'summary',
};

/**
 * A step of the seven-step numbering the calculator had until 26 September 2026 — its fifth
 * step laid the catalogue's floors and walls on the rooms by hand — in today's six: the
 * placement is part of the catalogue now, and the furniture and the summary are one step
 * earlier. For journeys recorded before (`migratePersisted` in the store, and a row's progress
 * without `steps: 6` in `calculatorProgress`).
 */
export function fromSevenSteps(step: number): CalculatorStepNumber {
  const n = Math.round(step);
  if (n <= 1) return 1;
  if (n <= 4) return n as CalculatorStepNumber;
  if (n === 5) return 4;
  return n === 6 ? 5 : 6;
}

export function calculatorStepHref(projectId: number, step: CalculatorStepNumber): string {
  return `/calculator/${projectId}/${CALCULATOR_STEP_PATHS[step]}`;
}

/** The way into a project's calculation: it opens where the person left it. */
export function calculatorEntryHref(projectId: number): string {
  return `/calculator/${projectId}`;
}

/** Which step a calculator URL is, or null for anything else (the hub, the entry). */
export function calculatorStepFromPath(pathname: string): CalculatorStepNumber | null {
  const match = /^\/calculator\/\d+\/([a-z]+)\/?$/.exec(pathname);
  if (!match) return null;
  const entry = Object.entries(CALCULATOR_STEP_PATHS).find(([, path]) => path === match[1]);
  return entry ? (Number(entry[0]) as CalculatorStepNumber) : null;
}
