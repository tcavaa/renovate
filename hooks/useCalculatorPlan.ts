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
 */

import { useEffect } from 'react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { calculatorRoomsFromPlan, planFromCalculatorRooms } from '@/lib/design/planGeometry';

export function useCalculatorPlan() {
  const plan = useDesignStore((s) => s.plan);
  const setPlan = useDesignStore((s) => s.setPlan);
  const rooms = useCalculatorStore((s) => s.rooms);
  const setRooms = useCalculatorStore((s) => s.setRooms);

  // The plan follows the calculator when they disagree about which flat this is.
  useEffect(() => {
    if (rooms.length === 0) return;
    const ids = new Set(rooms.map((r) => r.id));
    const overlap = plan ? plan.rooms.filter((r) => ids.has(r.id)).length : 0;
    if (!plan || (plan.rooms.length > 0 && overlap === 0)) setPlan(planFromCalculatorRooms(rooms));
  }, [plan, rooms, setPlan]);

  // The calculator follows the plan for everything else.
  useEffect(() => {
    if (!plan) return;
    const next = calculatorRoomsFromPlan(plan);
    const current = useCalculatorStore.getState().rooms;
    const same =
      next.length === current.length &&
      next.every((r, i) => {
        const c = current[i];
        return c && c.id === r.id && c.width === r.width && c.length === r.length && c.height === r.height && c.type === r.type && c.nameKa === r.nameKa && c.x === r.x && c.z === r.z;
      });
    if (!same) setRooms(next);
  }, [plan, setRooms]);

  return plan;
}
