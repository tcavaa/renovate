'use client';

import { Button3d } from '@/components/ui/button-3d';
import { designEntryHref } from '@/lib/design/steps';
import { useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * Opens a project's 3D design — a link to its entry (`/design/<id>`), which opens the design
 * where it was left, or, for a project that has only a calculation so far, carries the
 * calculation into the studio (`handOffToDesign`: rooms, home state and every pick). Nothing is
 * loaded here: the project's own steps do that (`ProjectGate`).
 *
 * A design the project already has always opens, however far it got; one that would be made
 * from the calculation needs rooms to be made from.
 */
export function OpenIn3dButton({ project, size = 'md', className }: { project: Pick<SavedProjectInput, 'id' | 'rooms' | 'hasDesign'>; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useT();
  return (
    <Button3d href={designEntryHref(project.id)} size={size} className={className} disabled={!project.hasDesign && project.rooms.length === 0}>
      {project.hasDesign ? t.profile.openIn3d : t.profile.createIn3d}
    </Button3d>
  );
}
