'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';
import { saveDesign } from '@/lib/design/saveDesign';
import { forgetHalf, type ProjectHalf } from '@/lib/flow/projectSync';
import { problemOf, useSaveProblems } from '@/lib/flow/saveQueue';
import { CALCULATOR_HUB_HREF } from '@/lib/calculator/steps';
import { DESIGN_HUB_HREF } from '@/lib/design/steps';

/**
 * Says so when a half of the open project could not be saved, and offers the way out. The work
 * is never at risk meanwhile: it stays in this browser, marked unsaved (`lib/flow/projectSync`).
 *
 *  - **Changed elsewhere** — the half was saved from another tab or computer since this copy
 *    was opened, and the server refused to write an older copy over it: take the latest
 *    (this browser's copy is let go) or keep this one (written over the other).
 *  - **A product that is gone** — the catalogue no longer has something the project uses; the
 *    save goes through once it is swapped for another.
 *  - **Deleted** — in another tab or on another computer: there is nothing to save into any
 *    more, and the way on is the hub.
 *  - **Anything else** — offline, the server down: try again (the next change tries anyway).
 *
 * A save that goes through clears the banner and — when nothing changed while it was on its way
 * — the unsaved mark, in the save helpers themselves.
 */
export function SaveProblemBanner({ projectId }: { projectId: number }) {
  const t = useT();
  const problems = useSaveProblems((s) => s.problems);
  const [busy, setBusy] = useState(false);
  const halves = (['calculator', 'design'] as const).filter((half) => problems[`${half}:${projectId}`]);
  if (halves.length === 0) return null;
  const half: ProjectHalf = halves[0];
  const problem = problems[`${half}:${projectId}`];

  const save = (force: boolean) => {
    setBusy(true);
    const run = half === 'calculator' ? saveCalculatorProject({ draft: true, projectId, force }) : saveDesign({ draft: true, projectId, force });
    run
      .then(() => useSaveProblems.getState().report(half, projectId, null))
      .catch((error: unknown) => useSaveProblems.getState().report(half, projectId, problemOf(error)))
      .finally(() => setBusy(false));
  };

  const loadLatest = () => {
    forgetHalf(half, projectId);
    window.location.reload();
  };

  const text = problem === 'conflict' ? t.hub.conflictText : problem === 'unknown-product' ? t.hub.unknownProductText : problem === 'gone' ? t.hub.goneText : t.hub.saveErrorText;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-xl border border-warning/60 bg-white p-4 shadow-cardHover">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-ink">{text}</p>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {problem === 'gone' ? (
          <Button size="sm" variant="ink" asChild>
            <Link href={half === 'calculator' ? CALCULATOR_HUB_HREF : DESIGN_HUB_HREF}>{t.hub.allProjects}</Link>
          </Button>
        ) : problem === 'conflict' ? (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={loadLatest}>
              {t.hub.conflictLoadLatest}
            </Button>
            <Button size="sm" variant="ink" disabled={busy} onClick={() => save(true)}>
              {t.hub.conflictKeepMine}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ink" disabled={busy} onClick={() => save(false)}>
            {t.hub.retry}
          </Button>
        )}
      </div>
    </div>
  );
}
