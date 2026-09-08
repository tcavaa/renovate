'use client';

import { useRouter } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * Opens a saved project in the calculator: its rooms (from the plan when it was designed
 * first), home state and any picks it already has. The next save writes into the same row,
 * so a design gets its renovation costs and stays one project. The saved 3D scene is parked
 * in the design store as well, so "view in 3D" from the summary finds it again.
 */
export function CalculateCostsButton({ project, size = 'md', className }: { project: SavedProjectInput; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const router = useRouter();
  const t = useT();
  const openSavedProject = useCalculatorStore((s) => s.openSavedProject);
  const openSaved = useDesignStore((s) => s.openSaved);

  const open = () => {
    openSavedProject({
      projectId: project.id,
      rooms: project.rooms,
      homeState: project.homeState,
      selectedProducts: project.selectedProducts,
      selectedFurniture: project.selectedFurniture,
    });
    if (project.plan && project.scene) {
      openSaved({ projectId: project.id, plan: project.plan, scene: project.scene, floorPlanUrl: project.floorPlanUrl, homeState: project.homeState });
    }
    router.push('/calculator');
  };

  return (
    <Button type="button" variant="outline" size={size === 'md' ? 'default' : size} className={className} onClick={open} disabled={project.rooms.length === 0}>
      <Calculator className="h-4 w-4" />
      {project.hasCalculator ? t.profile.openInCalculator : t.profile.calculateCosts}
    </Button>
  );
}
