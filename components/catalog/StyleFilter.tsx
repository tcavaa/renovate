'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Multi-select style filter for the catalogue toolbar. The selection lives in the URL as
 * `style=modern,vintage`, so toggling a box navigates; the server does the filtering.
 */
export function StyleFilter({
  label,
  allLabel,
  options,
  selected,
  raw,
}: {
  label: string;
  allLabel: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  raw: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const navigate = (next: string[]) => {
    const params = new URLSearchParams(raw);
    params.delete('page');
    if (next.length) params.set('style', next.join(','));
    else params.delete('style');
    const qs = params.toString();
    router.push(qs ? `/catalog?${qs}` : '/catalog', { scroll: false });
  };

  const toggle = (id: string) => navigate(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const summary = selected.length === 0 ? allLabel : selected.length === 1 ? options.find((o) => o.id === selected[0])?.label ?? selected[0] : `${selected.length} · ${label}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn('flex h-10 items-center gap-2 border bg-bg-surface px-3 text-sm transition-colors', selected.length ? 'border-ink text-ink' : 'border-line text-ink-soft hover:border-ink')}
      >
        <span className="eyebrow">{label}</span>
        <span className="max-w-[10rem] truncate">{summary}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul role="listbox" aria-multiselectable className="absolute left-0 top-full z-40 mt-2 w-56 border border-line bg-bg-surface shadow-cardHover animate-fade-in">
          {options.map((o) => {
            const active = selected.includes(o.id);
            return (
              <li key={o.id} role="option" aria-selected={active} className="border-b border-line last:border-b-0">
                <button type="button" onClick={() => toggle(o.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-bg-base hover:text-ink">
                  <span className={cn('grid h-4 w-4 shrink-0 place-items-center border', active ? 'border-ink bg-ink text-white' : 'border-line')}>{active && <Check className="h-3 w-3" />}</span>
                  <span className={cn(active && 'font-medium text-ink')}>{o.label}</span>
                </button>
              </li>
            );
          })}
          {selected.length > 0 && (
            <li className="border-t border-line">
              <button type="button" onClick={() => navigate([])} className="w-full px-3 py-2 text-left text-xs text-ink-muted hover:text-ink">
                {allLabel}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
