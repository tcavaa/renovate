'use client';

/**
 * The styles as one small button that opens a list upward — the finishes tray's style filter.
 *
 * The furniture shelf keeps its four style chips down its left edge; the finishes tray has its
 * surfaces there (floor · walls · skirting · cornice) and its brush sizes on its top line, so
 * the same filter folds into a button that says what is ticked: the project's own style (the
 * brand dot), "2 styles", or every style. The list is the furniture shelf's chips, the
 * project's own marked whether ticked or not.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronUp } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { styleLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { STYLE_IDS } from '@/lib/design/styles';
import type { StyleId } from '@/lib/design/types';
import { cn } from '@/lib/utils';

export function StylePicker({ styles, onChange, own }: { styles: StyleId[]; onChange: (styles: StyleId[]) => void; /** The project's own style. */ own: StyleId }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    // Escape folds the list and nothing else: the studio's own Escape (drop the brush, let
    // go of the selection) listens on the window, further up, and must not hear it.
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: StyleId) => onChange(styles.includes(id) ? styles.filter((s) => s !== id) : [...styles, id]);
  const single = styles.length === 1 ? styles[0] : null;
  const summary = single ? styleLabel(t, single) : styles.length === 0 ? t.design.stylesAll : fill(t.design.stylesCount, { n: styles.length });

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t.design.styleTitle}
        className={cn('flex h-7 max-w-[128px] items-center gap-1 rounded-[8px] px-2 text-[10px] font-semibold transition-colors', styles.length > 0 ? 'bg-ink/10 text-ink hover:bg-ink/15' : 'border border-line bg-white text-ink-soft hover:border-ink')}
      >
        {single === own && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />}
        <span className="truncate">{summary}</span>
        <ChevronUp className={cn('h-3 w-3 shrink-0 text-ink-faint transition-transform', !open && 'rotate-180')} />
      </button>
      {open && (
        <div role="group" aria-label={t.design.styleTitle} className="absolute bottom-full right-0 z-50 mb-2 flex w-[172px] flex-col gap-0.5 rounded-[12px] border border-line bg-white p-1.5 shadow-float animate-fade-in">
          {STYLE_IDS.map((id) => {
            const active = styles.includes(id);
            const mine = id === own;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                title={mine ? `${styleLabel(t, id)} · ${t.design.yourStyle}` : styleLabel(t, id)}
                onClick={() => toggle(id)}
                className={cn('flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-left text-[11px] font-semibold transition-colors', active && mine ? 'bg-brand text-white' : active ? 'bg-ink text-white' : mine ? 'text-ink ring-1 ring-inset ring-brand/40 hover:bg-sand-light' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}
              >
                {mine && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-white' : 'bg-brand')} aria-hidden />}
                <span className="flex-1 truncate">{styleLabel(t, id)}</span>
                {active && <Check className="h-3 w-3 shrink-0" />}
              </button>
            );
          })}
          <button type="button" onClick={() => onChange([])} disabled={styles.length === 0} className="mt-0.5 h-7 rounded-[7px] px-2 text-left text-[11px] text-ink-muted hover:bg-sand-light hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">
            {t.design.stylesAll}
          </button>
        </div>
      )}
    </div>
  );
}
