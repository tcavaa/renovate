/**
 * The order of the steps, which is not always the same.
 *
 * A green frame is a home that is finished: the walls are painted, the tiles are laid and
 * the sockets are in. Its technical step *records* what is already there, so it belongs
 * right after the flat is drawn, while the person still has the plan in their head — and
 * the same goes for a design-only project, where nothing is being built at all.
 *
 * Every other condition is a renovation: the pipes, the radiators and the wiring are going
 * in from scratch, and where they go depends on where the furniture ends up. There the
 * technical setup is done *in the studio*, its Technical section, against the furniture that
 * is actually there — and the budget waits until it has been (the studio's "budget" button).
 * The finishes (step 6) are the studio's Materials section in every project. Neither is a
 * step of its own in the strip then: a renovation walks Plan · Existing home · Style · 3D
 * design · Budget · Brigade, a finished home Plan · Existing home · Technical · Style · 3D
 * design · Budget · Brigade (the owner's notes of 29 Oct 2026).
 *
 * The step numbers here are the steps themselves and never change — a saved project and every
 * URL name them; what changes is the position each one is walked in. A step the strip does not
 * show stands where the studio does (`walkedStep`). Pages say which step they are, the strip
 * says where that falls in the journey, and `nextStep`/`previousStep` keep every "back" and
 * "continue" agreeing with the strip.
 */

import type { HomeState } from '@/lib/calculator/types';
import type { TechnicalCheck } from '@/lib/design/technical';
import type { DesignMode } from '@/lib/design/types';
import type { StudioStep } from '@/store/designStore';

/** The hub: the design's intro and the person's projects. */
export const DESIGN_HUB_HREF = '/design';

/** Where each step lives inside a project (`/design/<id>/<path>`). Steps 5 and 6 are the same studio page with a different tool. */
export const DESIGN_STEP_PATHS: Record<StudioStep, string> = {
  1: 'start',
  2: 'plan',
  3: 'technical',
  4: 'style',
  5: 'studio',
  6: 'studio?tool=finishes',
  7: 'summary',
  8: 'workers',
};

export function designStepHref(projectId: number, step: StudioStep): string {
  return `/design/${projectId}/${DESIGN_STEP_PATHS[step]}`;
}

/** The technical step opened on one of its checks — the studio's way to the works (`technicalCheckFrom` reads it). */
export function technicalCheckHref(projectId: number, check: TechnicalCheck): string {
  return `${designStepHref(projectId, 3)}?check=${check}`;
}

/**
 * The way into a project's design: it opens where the person left it (`lib/flow/resume`).
 * `from=calculator` carries the calculator's latest picks into it (`startFromCalculator`).
 */
export function designEntryHref(projectId: number, from?: 'calculator'): string {
  return from ? `/design/${projectId}?from=${from}` : `/design/${projectId}`;
}

/** Which step a design URL is, or null for anything else (the hub, the entry). */
export function designStepFromPath(pathname: string, tool?: string | null): StudioStep | null {
  const match = /^\/design\/\d+\/([a-z]+)\/?$/.exec(pathname);
  if (!match) return null;
  switch (match[1]) {
    case 'start':
      return 1;
    case 'plan':
      return 2;
    case 'technical':
      return 3;
    case 'style':
      return 4;
    case 'studio':
      return tool === 'finishes' ? 6 : 5;
    case 'summary':
      return 7;
    case 'workers':
      return 8;
    default:
      return null;
  }
}

/** The technical setup is recorded, not planned: the home is already finished. */
export function technicalComesFirst(homeState: HomeState | null | undefined, mode: DesignMode): boolean {
  return mode === 'design_only' || homeState === 'green_frame' || homeState == null;
}

/** The steps this project walks, in order — what the strip shows. */
export function designStepOrder(homeState: HomeState | null | undefined, mode: DesignMode): StudioStep[] {
  return technicalComesFirst(homeState, mode) ? [1, 2, 3, 4, 5, 7, 8] : [1, 2, 4, 5, 7, 8];
}

/**
 * Where a page stands in the walk: itself, or — for a step the strip does not show — the studio,
 * whose section it is (the finishes always; the technical setup of a renovation).
 */
export function walkedStep(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): StudioStep {
  if (step === 6) return 5;
  if (step === 3 && !technicalComesFirst(homeState, mode)) return 5;
  return step;
}

/** Which place in the journey a step falls in, counting from one. */
export function designStepPosition(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): number {
  return designStepOrder(homeState, mode).indexOf(walkedStep(step, homeState, mode)) + 1;
}

/** How many steps this project walks. */
export function designStepCount(homeState: HomeState | null | undefined, mode: DesignMode): number {
  return designStepOrder(homeState, mode).length;
}

export function nextStep(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): StudioStep | null {
  const order = designStepOrder(homeState, mode);
  return order[order.indexOf(walkedStep(step, homeState, mode)) + 1] ?? null;
}

export function previousStep(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): StudioStep | null {
  const order = designStepOrder(homeState, mode);
  const at = order.indexOf(walkedStep(step, homeState, mode));
  return at > 0 ? order[at - 1] : null;
}

/** The href of the step after this one, or the budget when there is none left. */
export function nextStepHref(projectId: number, step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): string {
  const next = nextStep(step, homeState, mode);
  return designStepHref(projectId, next ?? 7);
}

export function previousStepHref(projectId: number, step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): string {
  const previous = previousStep(step, homeState, mode);
  return designStepHref(projectId, previous ?? 1);
}
