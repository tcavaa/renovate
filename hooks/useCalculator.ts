'use client';

import { useMemo } from 'react';
import { useCalculatorStore } from '@/store/calculatorStore';
import {
  buildProjectSummary,
  calculateMaterials,
  calculateWorkerCosts,
  aggregateRoomTotals,
} from '@/lib/calculator/materials';

export function useCalculator() {
  const { rooms, homeState, selectedProducts, selectedFurniture } = useCalculatorStore();

  const ready = !!homeState && rooms.length > 0;

  const data = useMemo(() => {
    if (!ready) return null;
    const products = Object.values(selectedProducts);
    const furniture = Object.values(selectedFurniture).flat();
    return {
      totals: aggregateRoomTotals(rooms),
      materials: calculateMaterials(rooms, homeState),
      workerCosts: calculateWorkerCosts(rooms, homeState),
      summary: buildProjectSummary(rooms, homeState, products, furniture),
    };
  }, [ready, rooms, homeState, selectedProducts, selectedFurniture]);

  return { ready, data };
}
