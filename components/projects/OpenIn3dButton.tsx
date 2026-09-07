'use client';

import { useRouter } from 'next/navigation';
import { Button3d } from '@/components/ui/button-3d';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * Opens a saved project in 3D. A design project comes back exactly as it was saved and lands
 * in the studio; a calculator project is carried into the studio the way the summary page
 * does it — rooms, home state and every pick — and lands on the style step.
 */
export function OpenIn3dButton({ project, size = 'md', className }: { project: SavedProjectInput; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const router = useRouter();
  const t = useT();
  const openSaved = useDesignStore((s) => s.openSaved);
  const startFromCalculator = useDesignStore((s) => s.startFromCalculator);

  const open = () => {
    if (project.plan && project.scene) {
      openSaved({ plan: project.plan, scene: project.scene, floorPlanUrl: project.floorPlanUrl, homeState: project.homeState });
      router.push('/design/studio');
      return;
    }
    startFromCalculator({ rooms: project.rooms, homeState: project.homeState, selectedProducts: project.selectedProducts, selectedFurniture: project.selectedFurniture });
    router.push('/design/style');
  };

  return (
    <Button3d onClick={open} size={size} className={className} disabled={project.rooms.length === 0}>
      {t.profile.openIn3d}
    </Button3d>
  );
}
