/**
 * The order of the eight steps, which is not always the same.
 *
 * A green frame is a home that is finished: the walls are painted, the tiles are laid and
 * the sockets are in. Its technical step *records* what is already there, so it belongs
 * right after the flat is drawn, while the person still has the plan in their head — and
 * the same goes for a design-only project, where nothing is being built at all.
 *
 * Every other condition is a renovation: the pipes, the radiators and the wiring are going
 * in from scratch, and where they go depends on where the furniture ends up. There the
 * technical step comes *after* the design, next to the budget it feeds.
 *
 * The step numbers here are the steps themselves and never change; what changes is the
 * position each one is walked in. Pages say which step they are, the strip says where that
 * falls in the journey, and `nextStep`/`previousStep` keep every "back" and "continue"
 * agreeing with the strip.
 */

import type { HomeState } from '@/lib/calculator/types';
import type { DesignMode } from '@/lib/design/types';
import type { StudioStep } from '@/store/designStore';

/** Where each step lives. Steps 5 and 6 are the same studio page with a different tool. */
export const DESIGN_STEP_HREFS: Record<StudioStep, string> = {
  1: '/design',
  2: '/design/plan',
  3: '/design/technical',
  4: '/design/style',
  5: '/design/studio',
  6: '/design/studio?tool=finishes',
  7: '/design/summary',
  8: '/design/workers',
};

/** The technical setup is recorded, not planned: the home is already finished. */
export function technicalComesFirst(homeState: HomeState | null | undefined, mode: DesignMode): boolean {
  return mode === 'design_only' || homeState === 'green_frame' || homeState == null;
}

/** The eight steps in the order this project walks them. */
export function designStepOrder(homeState: HomeState | null | undefined, mode: DesignMode): StudioStep[] {
  return technicalComesFirst(homeState, mode) ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 4, 5, 6, 3, 7, 8];
}

/** Which place in the journey a step falls in, counting from one. */
export function designStepPosition(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): number {
  return designStepOrder(homeState, mode).indexOf(step) + 1;
}

export function nextStep(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): StudioStep | null {
  const order = designStepOrder(homeState, mode);
  return order[order.indexOf(step) + 1] ?? null;
}

export function previousStep(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): StudioStep | null {
  const at = designStepOrder(homeState, mode).indexOf(step);
  return at > 0 ? designStepOrder(homeState, mode)[at - 1] : null;
}

/** The href of the step after this one, or the budget when there is none left. */
export function nextStepHref(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): string {
  const next = nextStep(step, homeState, mode);
  return DESIGN_STEP_HREFS[next ?? 7];
}

export function previousStepHref(step: StudioStep, homeState: HomeState | null | undefined, mode: DesignMode): string {
  const previous = previousStep(step, homeState, mode);
  return DESIGN_STEP_HREFS[previous ?? 1];
}
