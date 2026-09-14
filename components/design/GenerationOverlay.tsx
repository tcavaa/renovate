'use client';

/**
 * The moment between "generate" and the studio: the steps of the build ticking through —
 * walls, doors and windows, furniture, finishes, wiring — so the person sees what was made
 * from what they drew. The work itself takes a few milliseconds; the pace here is for the
 * person, not the machine.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function GenerationOverlay({ open, onDone }: { open: boolean; onDone: () => void }) {
  const t = useT();
  const steps = [t.build.genWalls, t.build.genOpenings, t.build.genFurniture, t.build.genFinishes, t.build.genWiring];
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!open) {
      setDone(0);
      return;
    }
    let cancelled = false;
    const tick = (n: number) => {
      if (cancelled) return;
      setDone(n);
      if (n >= steps.length) {
        window.setTimeout(() => !cancelled && onDone(), 450);
        return;
      }
      window.setTimeout(() => tick(n + 1), 380);
    };
    tick(0);
    return () => {
      cancelled = true;
    };
    // The step labels only change with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/90 backdrop-blur-md" role="status" aria-live="polite">
      <div className="w-[min(92vw,420px)] rounded-[20px] border border-line bg-white p-6 shadow-cardHover">
        <p className="eyebrow">{t.build.genTitle}</p>
        <ul className="mt-4 space-y-2">
          {steps.map((label, i) => {
            const finished = i < done;
            const active = i === done;
            return (
              <li key={label} className={cn('flex items-center gap-3 text-sm', finished ? 'text-ink' : active ? 'text-ink' : 'text-ink-faint')}>
                <span className={cn('grid h-6 w-6 place-items-center rounded-full', finished ? 'bg-success text-white' : active ? 'bg-brand/10 text-brand' : 'bg-sand text-ink-faint')}>
                  {finished ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
                </span>
                {label}
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-xs text-ink-muted">{done >= steps.length ? t.build.genDone : t.build.genHint}</p>
      </div>
    </div>
  );
}
