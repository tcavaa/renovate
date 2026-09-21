'use client';

/**
 * Starting over, from any step of either journey.
 *
 * The two products keep their work apart in the browser — the calculator and its own
 * drawing board on one side, the studio on the other, three stores and three localStorage
 * keys — and "start again" means *this* journey's: the calculator empties the calculator and
 * its board, the studio empties the studio. What is worth warning about first depends on how
 * far the person got: a plan that was never saved is gone for good, and a design that has
 * been laid out took a generation to make.
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
 * Empties one journey and leaves the other alone.
 *
 * It used to empty both — "two halves of one project" — and that cost people their design:
 * somebody who had furnished a flat in the studio and then started a new estimate in the
 * calculator came back to an empty studio. The two are separate work with separate storage,
 * and a project that really is shared lives in its row on the server, where neither reset
 * reaches it. A calculator that starts over lets go of the project id, so the next estimate
 * is a new row and cannot write over the design's.
 */
export function resetFlow(kind: FlowKind): void {
  if (kind === 'calculator') {
    useCalculatorStore.getState().reset();
    useCalculatorPlanStore.getState().reset();
    return;
  }
  useDesignStore.getState().reset();
}
