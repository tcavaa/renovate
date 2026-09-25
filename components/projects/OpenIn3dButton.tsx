'use client';

import { useRouter } from 'next/navigation';
import { Button3d } from '@/components/ui/button-3d';
import { useDesignStore } from '@/store/designStore';
import { DESIGN_STEP_HREFS } from '@/lib/design/steps';
import { useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';
import { useOpenProject } from './useOpenProject';

/**
 * Opens a saved project in 3D. A design project comes back exactly as it was saved and lands
 * in the studio; a calculator project is carried into the studio the way the summary page
 * does it — rooms, home state and every pick — and lands on the style step.
 */
export function OpenIn3dButton({ project, size = 'md', className }: { project: SavedProjectInput; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const router = useRouter();
  const t = useT();
  const { open: openProject, dialog } = useOpenProject(project);

  const open = () =>
    openProject('design', (resumed) => {
      if (project.plan && project.scene) {
        if (!resumed) useDesignStore.getState().openSaved({ projectId: project.id, plan: project.plan, scene: { ...project.scene, progress: project.designProgress }, floorPlanUrl: project.floorPlanUrl, homeState: project.homeState, versions: project.versions });
        // Where the design now stands — as saved, or as it is in this browser when resumed: a
        // draft that was never laid out goes back to the step it was on, not to a studio.
        const opened = useDesignStore.getState();
        router.push(opened.generated ? '/design/studio' : DESIGN_STEP_HREFS[opened.step]);
        return;
      }
      if (resumed) {
        router.push('/design');
        return;
      }
      useDesignStore.getState().startFromCalculator({ rooms: project.rooms, homeState: project.homeState, selectedProducts: project.selectedProducts, selectedFurniture: project.selectedFurniture, projectId: project.id, plan: project.plan, floorPlanUrl: project.floorPlanUrl, choices: project.calculatorEdits?.choices });
      router.push('/design/style');
    });

  return (
    <>
      <Button3d onClick={open} size={size} className={className} disabled={project.rooms.length === 0}>
        {project.hasDesign ? t.profile.openIn3d : t.profile.createIn3d}
      </Button3d>
      {dialog}
    </>
  );
}
