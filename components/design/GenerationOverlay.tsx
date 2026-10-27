'use client';

/**
 * The moment between "generate" and the studio: the steps of the build ticking through —
 * walls, doors and windows, furniture, finishes, wiring — so the person sees what was made
 * from what they drew. The engine takes a few milliseconds; the pace here is for the person.
 *
 * With the AI designer (`ai`), the server's generation job is the pace (`stage`, as the style page
 * last heard it — `lib/design/generationJob`): while it is designing the overlay moves through the
 * designer's steps every few seconds but stops before the check; when it is checking it stands on
 * the check; when it is done it finishes the rest and calls `onDone`.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { GenerationStage } from '@/lib/design/generationJob';

/** The AI steps' positions: the designer's own run from 2; the check is 6. */
const DESIGNER_FROM = 2;
const CHECK_STEP = 6;

export function GenerationOverlay({ open, onDone, ai = false, stage = 'done' }: { open: boolean; onDone: () => void; ai?: boolean; stage?: GenerationStage }) {
  const t = useT();
  const steps = ai
    ? [t.build.genWalls, t.build.genOpenings, t.decor.genAiStep1, t.decor.genAiStep2, t.decor.genAiStep3, t.decor.genAiStep4, t.decor.genAiStep5, t.build.genWiring]
    : [t.build.genWalls, t.build.genOpenings, t.build.genFurniture, t.build.genFinishes, t.build.genWiring];
  const [done, setDone] = useState(0);
  const stageRef = useRef(stage);
  const doneRef = useRef(onDone);
  useEffect(() => {
    stageRef.current = stage;
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!open) {
      setDone(0);
      return;
    }
    let cancelled = false;
    let timer = 0;
    const tick = (n: number, heldMs = 0) => {
      if (cancelled) return;
      setDone(n);
      if (n >= steps.length) {
        timer = window.setTimeout(() => !cancelled && doneRef.current(), 450);
        return;
      }
      if (ai && n >= DESIGNER_FROM) {
        const current = stageRef.current;
        // How far the job's stage lets the steps go: before the check while designing, the check
        // while checking, all of them once done.
        const ceiling = current === 'done' || current === 'failed' ? steps.length : current === 'checking' ? CHECK_STEP : CHECK_STEP - 1;
        if (n >= ceiling) {
          timer = window.setTimeout(() => tick(n), 400);
          return;
        }
        // While the designer works: a step every few seconds, looking again every moment.
        if (current === 'designing') {
          timer = window.setTimeout(() => (heldMs >= 7000 ? tick(n + 1) : tick(n, heldMs + 400)), 400);
          return;
        }
      }
      timer = window.setTimeout(() => tick(n + 1), ai ? 300 : 380);
    };
    tick(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // The step labels only change with the language; `stage` is read through its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ai]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/90 backdrop-blur-md" role="status" aria-live="polite">
      <div className="w-[min(92vw,440px)] rounded-[20px] border border-line bg-bg-surface p-6 shadow-cardHover">
        <p className="eyebrow flex items-center gap-1.5">
          {ai && <Sparkles className="h-3.5 w-3.5 text-brand" />}
          {ai ? t.decor.genAi : t.build.genTitle}
        </p>
        <ul className="mt-4 space-y-2">
          {steps.map((label, i) => {
            const finished = i < done;
            const active = i === done;
            return (
              <li key={label} className={cn('flex items-center gap-3 text-sm', finished ? 'text-ink' : active ? 'text-ink' : 'text-ink-faint')}>
                <span className={cn('grid h-6 w-6 place-items-center rounded-full', finished ? 'bg-olive text-sand-light' : active ? 'bg-brand/10 text-brand' : 'bg-sand text-ink-faint')}>
                  {finished ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
                </span>
                {label}
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-xs text-ink-muted">{done >= steps.length ? (ai ? t.decor.genAiDone : t.build.genDone) : ai ? t.decor.genAiHint : t.build.genHint}</p>
      </div>
    </div>
  );
}
