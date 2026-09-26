'use client';

import Link from 'next/link';
import { Check, FolderOpen, Lock } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { useOptionalProjectMeta } from '@/components/projects/ProjectGate';

export interface FlowStep {
  num: number;
  label: string;
  href: string;
}

/**
 * The journey as an editorial index: numbered cells under the header, hairline above and
 * below, the current one underscored in ink. Done steps are links back; upcoming ones are
 * faded and inert; steps before `lockedBefore` are shut with a padlock — the 3D design has
 * been made and the things that fed it cannot be changed under it any more. The project the
 * steps belong to sits at the end. There is no "start again": a new start is a new project.
 *
 * Shared by the calculator and the design studio, which shut a step for different reasons —
 * hence `lockedTitle`; the default says it was the 3D design.
 */
export function StepStrip({ steps, current, reached = 0, lockedBefore = 0, lockedTitle }: { steps: FlowStep[]; current: number; /** The furthest step the journey has got to: every step up to it is a link, ahead of the page as well as behind it. */ reached?: number; /** Steps numbered below this are closed. */ lockedBefore?: number; /** Why those steps are shut. */ lockedTitle?: string }) {
  const t = useT();
  const furthest = Math.max(current, reached);
  return (
    <nav aria-label="steps" className="border-b border-line bg-bg-base">
      <div className="container flex items-stretch gap-2">
      <ol className="grid flex-1 auto-cols-fr grid-flow-col">
        {steps.map((step) => {
          const locked = step.num < lockedBefore;
          // A step the journey has been to is done whichever side of the open page it is on.
          const status = locked ? 'locked' : step.num === current ? 'current' : step.num <= furthest ? 'done' : 'upcoming';
          const reachable = !locked && step.num <= furthest;
          const inner = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center text-[10px] font-semibold tabular-nums',
                    status === 'done' && 'bg-ink text-white',
                    status === 'current' && 'bg-brand text-white',
                    status === 'locked' && 'bg-sand text-ink-faint',
                    status === 'upcoming' && 'border border-line text-ink-faint'
                  )}
                >
                  {status === 'done' ? <Check className="h-3 w-3" /> : status === 'locked' ? <Lock className="h-2.5 w-2.5" /> : String(step.num).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-xs font-medium sm:inline',
                    status === 'current' ? 'text-ink' : status === 'done' ? 'text-ink-soft' : 'text-ink-faint'
                  )}
                >
                  {step.label}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-0 bottom-0 h-[2px] transition-colors',
                  status === 'current' ? 'bg-ink' : 'bg-transparent'
                )}
              />
            </>
          );
          const cell = cn(
            'relative flex h-12 min-w-0 items-center justify-center overflow-hidden px-2 sm:justify-start sm:px-4',
            'border-l border-line first:border-l-0',
            reachable && status !== 'current' && 'transition-colors hover:bg-white'
          );
          return (
            <li key={step.num} aria-current={status === 'current' ? 'step' : undefined} className="min-w-0">
              {reachable ? (
                <Link href={step.href} className={cell}>
                  {inner}
                </Link>
              ) : (
                <div className={cell} title={status === 'locked' ? lockedTitle ?? t.flow.lockedStep : undefined}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <OpenedProjectChip />
      </div>
    </nav>
  );
}

/** Names the project the steps belong to, with where it stands, and leads to its page. */
function OpenedProjectChip() {
  const t = useT();
  const project = useOptionalProjectMeta();
  if (!project) return null;
  const status = project.status === 'submitted' ? t.status.submitted : project.status === 'saved' ? t.status.saved : t.status.draft;
  return (
    <Link
      href={`/profile/projects/${project.id}`}
      title={t.profile.workspaceBarBack}
      className="flex min-w-0 max-w-[26%] shrink-0 items-center gap-2 self-center border border-line bg-white px-2.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden shrink-0 text-ink-muted 2xl:inline">{t.profile.workspaceBar}</span>
      <span className="hidden truncate font-semibold text-ink md:inline">{project.name || `#${project.id}`}</span>
      <span className="shrink-0 bg-sand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{status}</span>
    </Link>
  );
}
