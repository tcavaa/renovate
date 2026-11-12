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
    <nav aria-label="steps" className="border-b border-line bg-bg-surface">
      <div className="container flex items-center gap-2 py-1.5">
      <ol className="grid flex-1 auto-cols-fr grid-flow-col gap-1">
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
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold leading-none tabular-nums',
                    status === 'done' && 'bg-ink text-lime',
                    status === 'current' && 'bg-ink text-white',
                    status === 'locked' && 'bg-mist text-ink-faint',
                    status === 'upcoming' && 'bg-mist-light text-ink-faint'
                  )}
                >
                  {status === 'done' ? <Check className="h-3 w-3" strokeWidth={3.5} /> : status === 'locked' ? <Lock className="h-2.5 w-2.5" /> : String(step.num).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-xs sm:inline',
                    status === 'current' ? 'font-bold text-ink' : status === 'done' ? 'font-semibold text-ink' : 'font-medium text-ink-faint'
                  )}
                >
                  {step.label}
                </span>
              </span>
            </>
          );
          const cell = cn(
            'relative flex h-10 min-w-0 items-center justify-center overflow-hidden rounded-full px-2 sm:justify-start sm:px-3',
            status === 'current' && 'bg-lime',
            reachable && status !== 'current' && 'transition-colors hover:bg-mist-light'
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
      className="flex min-w-0 max-w-[26%] shrink-0 items-center gap-2 self-center rounded-full bg-mist-light py-1 pl-3 pr-1 text-xs text-ink-soft transition-colors hover:bg-mist hover:text-ink"
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-ink" />
      <span className="hidden shrink-0 text-ink-muted 2xl:inline">{t.profile.workspaceBar}</span>
      <span className="hidden truncate font-semibold text-ink md:inline">{project.name || `#${project.id}`}</span>
      <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white">{status}</span>
    </Link>
  );
}
