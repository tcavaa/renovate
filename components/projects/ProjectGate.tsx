'use client';

import { createContext, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useActiveProject } from '@/store/projectScope';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { openProjectStores, type Journey } from '@/lib/flow/openProject';
import { pruneCaches } from '@/lib/flow/projectSync';
import { claimBrowser } from '@/lib/flow/owner';
import { calculatorStepFromPath } from '@/lib/calculator/steps';
import { designStepFromPath } from '@/lib/design/steps';
import { useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';
import { SaveProblemBanner } from '@/components/projects/SaveProblemBanner';

export interface ProjectMeta {
  id: number;
  name: string;
  status: SavedProjectInput['status'];
  journey: Journey;
  /** A save or an order changed it while the project is open. */
  setStatus: (status: SavedProjectInput['status']) => void;
  /**
   * The project's row as it was when the steps were opened — for what one journey reads of the
   * other half without opening it (the calculator's summary and the design).
   */
  snapshot: SavedProjectInput;
}

const ProjectContext = createContext<ProjectMeta | null>(null);

/** The project whose steps are open. Only inside `ProjectGate`. */
export function useProjectMeta(): ProjectMeta {
  const meta = useContext(ProjectContext);
  if (!meta) throw new Error('useProjectMeta outside a project');
  return meta;
}

/** The open project's id, for the step links (`calculatorStepHref`, `designStepHref`). Only inside `ProjectGate`. */
export function useProjectId(): number {
  return useProjectMeta().id;
}

/** The open project, or null outside one (components shared with pages outside the steps). */
export function useOptionalProjectMeta(): ProjectMeta | null {
  return useContext(ProjectContext);
}

/**
 * Every step of the calculator and the studio renders inside one of these
 * (`app/(main)/calculator/[id]/layout.tsx`, `…/design/[id]/layout.tsx`).
 *
 * It opens the project in this browser before anything inside it renders: both halves of it
 * into the project's own stores, from this browser's cache when that is current and from the
 * row the server layout read otherwise (`lib/flow/openProject`); then it makes it the open
 * project (`store/projectScope`), so every store hook underneath reads this project and no
 * other. The steps render only once that is done, and only in the browser — what they show
 * lives in the browser's stores, so there is nothing for the server to render for them.
 *
 * It also records the page that is open (`at`), so the project reopens where it was left.
 */
export function ProjectGate({ journey, project, userId, children }: { journey: Journey; project: SavedProjectInput; userId: number; children: React.ReactNode }) {
  const t = useT();
  const [ready, setReady] = useState<number | null>(null);
  const [status, setStatus] = useState(project.status);

  // Once per project: the row a refresh re-sends is the one already opened.
  useEffect(() => {
    // The account's before anything is read: another account's caches are forgotten, and work
    // from before projects existed is moved into its project first (`lib/flow/owner`).
    claimBrowser(userId);
    openProjectStores(journey, project);
    useActiveProject.getState().setId(project.id);
    pruneCaches(project.id);
    setStatus(project.status);
    setReady(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey, project.id, userId]);

  const meta = useMemo<ProjectMeta>(() => ({ id: project.id, name: project.nameKa, status, journey, setStatus, snapshot: project }), [project, status, journey]);

  if (ready !== project.id) {
    return (
      <div className="container flex min-h-[50vh] items-center justify-center py-24 text-sm text-ink-muted" role="status" aria-live="polite">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t.hub.opening}
      </div>
    );
  }
  return (
    <ProjectContext.Provider value={meta}>
      <Suspense fallback={null}>
        <StepRecorder journey={journey} />
      </Suspense>
      {children}
      <SaveProblemBanner projectId={project.id} />
    </ProjectContext.Provider>
  );
}

/** Writes the step whose page is open into the project (`at`), which is where it reopens. */
function StepRecorder({ journey }: { journey: Journey }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tool = search.get('tool');
  useEffect(() => {
    if (journey === 'calculator') {
      const step = calculatorStepFromPath(pathname);
      if (step) useCalculatorStore.getState().setAt(step);
    } else {
      const step = designStepFromPath(pathname, tool);
      if (step) useDesignStore.getState().setAt(step);
    }
  }, [journey, pathname, tool]);
  return null;
}
