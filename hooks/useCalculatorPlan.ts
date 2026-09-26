'use client';

/**
 * The calculator's rooms and the studio's plan are one drawing.
 *
 * The calculator used to keep its own list of rectangles; the plan editor now draws walls,
 * and rooms are what the walls enclose. So on the calculator's first step the plan in the
 * design store is the thing being edited, and the calculator's `rooms` are read off it after
 * every change (positions, sizes and the derived areas included). A calculation started
 * before the plan existed — typed rooms in an old session — becomes a plan on first sight;
 * a plan that belongs to a different flat than the calculator's rooms gives way to them.
 *
 * One effect, one snapshot: `reconcileCalculatorPlan` decides both stores' next state from
 * the same reading of both, taken fresh from the stores rather than from this render's
 * closure. Two effects that each trusted their own render's copy of the other store used to
 * chase each other for ever when the flats differed (see `lib/calculator/planSync.ts`).
 *
 * The board here is the calculator's own (`useCalculatorPlanStore`), not the studio's: the
 * two halves of a project keep separate drawings (the calculator's is saved as the row's
 * `calculator_board`), and a plan crosses between them only when the person asks — the
 * summary's "see it in 3D" (the design's entry hands the board over), or a design opened in
 * the calculator. Both stores are the open project's (`store/projectScope`).
 */

import { useEffect } from 'react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { reconcileCalculatorPlan } from '@/lib/calculator/planSync';

export function useCalculatorPlan() {
  const plan = useCalculatorPlanStore((s) => s.plan);
  const rooms = useCalculatorStore((s) => s.rooms);

  useEffect(() => {
    const design = useCalculatorPlanStore.getState();
    const calculator = useCalculatorStore.getState();
    const next = reconcileCalculatorPlan(design.plan, calculator.rooms);
    if (next.plan !== design.plan && next.plan) design.setPlan(next.plan);
    if (next.rooms !== calculator.rooms) calculator.setRooms(next.rooms);
  }, [plan, rooms]);

  return plan;
}
