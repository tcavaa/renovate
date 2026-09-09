'use client';

import { useRouter } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { picksFromScene, type SavedProjectInput } from '@/lib/projects/saved';

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
    // A project designed first has no calculator picks yet: the studio's products stand in,
    // so the furniture and materials steps show what was chosen rather than nothing.
    const noPicks = Object.keys(project.selectedProducts).length === 0 && Object.keys(project.selectedFurniture).length === 0;
    const picks = noPicks && project.scene ? picksFromScene(project.scene) : { selectedProducts: project.selectedProducts, selectedFurniture: project.selectedFurniture };
    openSavedProject({
      projectId: project.id,
      rooms: project.rooms,
      // A design-only project never chose a home state; the row's default is not a choice.
      homeState: project.hasCalculator ? project.homeState : null,
      ...picks,
    });
    if (project.plan && project.scene) {
      openSaved({ projectId: project.id, plan: project.plan, scene: project.scene, floorPlanUrl: project.floorPlanUrl, homeState: project.homeState });
    }
    // Plan and home state already settled means step 1 is done: straight to the materials.
    router.push(project.hasCalculator ? '/calculator/materials' : '/calculator');
  };

  return (
    <Button type="button" variant="outline" size={size === 'md' ? 'default' : size} className={className} onClick={open} disabled={project.rooms.length === 0}>
      <Calculator className="h-4 w-4" />
      {project.hasCalculator ? t.profile.openInCalculator : t.profile.calculateCosts}
    </Button>
  );
}
