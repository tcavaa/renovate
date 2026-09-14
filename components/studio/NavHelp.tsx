'use client';

/**
 * How to move around, always in view: rotate, pan, zoom, select, and the keys. A small
 * card in the corner of the studio that folds to a single button.
 */

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function NavHelp({ walking, onTour, open: controlledOpen, onOpenChange, className }: { walking: boolean; onTour: () => void; /** Folded or not, when the page drives it (the tour unfolds it). */ open?: boolean; onOpenChange?: (open: boolean) => void; className?: string }) {
  const t = useT();
  const [innerOpen, setInnerOpen] = useState(true);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={t.build.navTitle} data-tour="navhelp" className={cn('flex h-10 items-center gap-2 rounded-[12px] bg-white/85 px-3 text-xs font-semibold text-ink-soft shadow-glass backdrop-blur-xl hover:text-ink', className)}>
        <HelpCircle className="h-4 w-4" />
        {t.build.navTitle}
      </button>
    );
  }
  const rows: Array<[string, string]> = walking
    ? [
        [t.build.navRotate, t.build.navRotateHow],
        [t.build.navPan, 'WASD / ↑↓←→ · Shift'],
      ]
    : [
        [t.build.navRotate, t.build.navRotateHow],
        [t.build.navPan, t.build.navPanHow],
        [t.build.navZoom, t.build.navZoomHow],
        [t.build.navSelect, t.build.navSelectHow],
      ];
  return (
    <div className={cn('w-[280px] rounded-[14px] bg-white/85 p-3 text-xs shadow-glass backdrop-blur-xl', className)} data-tour="navhelp">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <HelpCircle className="h-4 w-4" />
          {t.build.navTitle}
        </p>
        <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-muted hover:bg-sand-light hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold text-ink-soft">{k}</dt>
            <dd className="text-ink-muted">{v}</dd>
          </div>
        ))}
      </dl>
      {!walking && <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-ink-muted">{t.build.shortcutList}</p>}
      <button type="button" onClick={onTour} className="mt-2 text-[11px] font-medium text-brand hover:underline">
        {t.build.tutorialAgain}
      </button>
    </div>
  );
}
