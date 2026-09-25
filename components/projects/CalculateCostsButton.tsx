'use client';

import { useRouter } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { picksFromScene, type SavedProjectInput } from '@/lib/projects/saved';
import { useOpenProject } from './useOpenProject';
import { CALCULATOR_STEP_HREFS, type CalculatorStep } from '@/components/calculator/StepIndicator';

/**
 * Opens a project in the calculator: its rooms (from the plan when it was designed first),
 * home state and any picks it already has — a saved or ordered one in a workspace of its own,
 * a draft in the person's own calculator (`useOpenProject`). The next save writes into the same row,
 * so a design gets its renovation costs and stays one project. The saved 3D scene is parked
 * in the design store as well, so "view in 3D" from the summary finds it again.
 */
export function CalculateCostsButton({ project, size = 'md', className }: { project: SavedProjectInput; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const router = useRouter();
  const t = useT();
  const { open: openProject, dialog } = useOpenProject(project);

  const open = () =>
    openProject('calculator', (resumed) => {
      // The stores are reached at the moment of loading: the workspace has just been chosen.
      if (!resumed) {
        // A project designed first has no calculator picks yet: the studio's products stand in,
        // so the furniture and materials steps show what was chosen rather than nothing.
        const noPicks = Object.keys(project.selectedProducts).length === 0 && Object.keys(project.selectedFurniture).length === 0;
        const picks = noPicks && project.scene ? picksFromScene(project.scene) : { selectedProducts: project.selectedProducts, selectedFurniture: project.selectedFurniture };
        useCalculatorStore.getState().openSavedProject({
          projectId: project.id,
          rooms: project.rooms,
          // A design-only project never chose a home state; the row's default is not a choice.
          homeState: project.hasCalculator ? project.homeState : null,
          ...picks,
          // The summary opens as it was left: the same lines ticked off, the same quantities.
          edits: noPicks ? null : project.calculatorEdits,
          // …and the journey where it was left: a draft saved on the plan step is not calculated yet.
          progress: project.calculatorProgress,
        });
        if (project.plan && project.scene) {
          useDesignStore.getState().openSaved({ projectId: project.id, plan: project.plan, scene: { ...project.scene, progress: project.designProgress }, floorPlanUrl: project.floorPlanUrl, homeState: project.homeState });
          // The calculator draws on its own board, so the saved plan is opened there as well —
          // otherwise step 1 would offer a blank sheet for a flat that is already drawn.
          useCalculatorPlanStore.getState().openSaved({ projectId: project.id, plan: project.plan, scene: project.scene, floorPlanUrl: project.floorPlanUrl, homeState: project.homeState });
        }
      }
      // Where the calculation now stands, as saved or as this browser has it: worked out, on to
      // the step it had got to (the materials for one saved before that was recorded); not yet,
      // back to the step it was on — the plan, or the way in.
      const opened = useCalculatorStore.getState();
      if (!opened.homeState) router.push('/calculator');
      else if (opened.calculated) router.push(CALCULATOR_STEP_HREFS[Math.max(3, opened.step) as CalculatorStep]);
      else router.push(CALCULATOR_STEP_HREFS[Math.min(2, opened.step) as CalculatorStep]);
    });

  return (
    <>
      <Button type="button" variant="outline" size={size === 'md' ? 'default' : size} className={className} onClick={open} disabled={project.rooms.length === 0}>
        <Calculator className="h-4 w-4" />
        {project.hasCalculator ? t.profile.openInCalculator : t.profile.calculateCosts}
      </Button>
      {dialog}
    </>
  );
}
