'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';
import { enterFreshWorkspace, enterProjectWorkspace, freshDraftInTheWay, freshHolds, type Journey } from '@/lib/flow/workspace';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * How a project is opened from "my projects", for the calculator and the 3D buttons alike
 * (`lib/flow/workspace`). A saved or ordered project goes into the project workspace; a draft
 * into the person's own journeys — asking first when a different draft is in progress there,
 * because one of the two drafts is deleted. `load` is called with the right workspace already
 * in force, so it reaches the stores through `getState()`; `resumed` is true when the fresh
 * journey already holds this very draft, which then carries on as it is rather than reloading.
 */
export function useOpenProject(project: SavedProjectInput) {
  const t = useT();
  const [pending, setPending] = useState<null | (() => void)>(null);

  const open = (journey: Journey, load: (resumed: boolean) => void) => {
    if (project.status !== 'draft') {
      enterProjectWorkspace({ id: project.id, name: project.nameKa, status: project.status });
      load(false);
      return;
    }
    const go = () => {
      enterFreshWorkspace();
      load(freshHolds(journey, project.id));
    };
    if (freshDraftInTheWay(journey, project.id)) setPending(() => go);
    else go();
  };

  const dialog = (
    <Dialog open={pending != null} onOpenChange={(o) => !o && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.profile.openDraftTitle}</DialogTitle>
          <DialogDescription>{t.profile.openDraftBody}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="ink"
            onClick={() => {
              const go = pending;
              setPending(null);
              go?.();
            }}
          >
            {t.profile.openDraftConfirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { open, dialog };
}
