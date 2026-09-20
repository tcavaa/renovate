'use client';

/**
 * Starting over, from any step of either journey.
 *
 * Both products keep their work in the browser — the calculator, its own drawing board and
 * the studio, three stores and three localStorage keys — so "start again" has to mean all
 * three, or the next flat inherits half of the last one. What is worth warning about first
 * depends on how far the person got: a plan that was never saved is gone for good, and a
 * design that has been laid out took a generation to make.
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';

export type FlowKind = 'calculator' | 'design';

export interface FlowState {
  /** There is work to lose: rooms drawn, products picked, a flat furnished. */
  hasWork: boolean;
  /** It is in a project row on the server, so starting over does not destroy it. */
  saved: boolean;
  /** The flat has been laid out in 3D — the part that cost a generation. */
  generated: boolean;
}

/** What the person stands to lose right now, read fresh from the stores. */
export function readFlowState(kind: FlowKind): FlowState {
  const calculator = useCalculatorStore.getState();
  const board = useCalculatorPlanStore.getState();
  const design = useDesignStore.getState();
  if (kind === 'calculator') {
    return {
      hasWork: calculator.rooms.length > 0 || (board.plan?.rooms.length ?? 0) > 0 || Object.keys(calculator.selectedProducts).length > 0,
      saved: calculator.projectId != null,
      generated: false,
    };
  }
  return {
    hasWork: (design.plan?.rooms.length ?? 0) > 0 || design.items.length > 0,
    saved: design.projectId != null,
    generated: design.generated,
  };
}

/**
 * Empties both products and both boards. One journey's reset clears the other as well: they
 * are two halves of one project the moment either hands over to the other, and leaving the
 * studio furnished while the calculator starts a new flat is how the two used to disagree.
 */
export function resetFlow(): void {
  useCalculatorStore.getState().reset();
  useCalculatorPlanStore.getState().reset();
  useDesignStore.getState().reset();
}
