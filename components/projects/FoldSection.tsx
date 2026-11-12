'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One block of the project page that folds: the title row is the toggle, with a + / −
 * in the corner and the block's figure (a count, a total) beside it. Children are whatever
 * the server rendered for the block, so the tables stay server components.
 */
export function FoldSection({
  title,
  count,
  aside,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="group flex w-full items-center justify-between gap-4 py-4 text-left">
        <h2 className="font-display text-2xl text-ink">
          {title}
          {count !== undefined && <span className="ml-2 inline-grid h-6 min-w-6 place-items-center rounded-full bg-mist px-1.5 align-middle text-xs font-bold tracking-normal tabular-nums text-ink">{count}</span>}
        </h2>
        <span className="flex shrink-0 items-center gap-4">
          {aside && <span className="text-sm text-ink-muted">{aside}</span>}
          <span className={cn('grid h-9 w-9 place-items-center rounded-full transition-colors', open ? 'bg-ink text-white' : 'bg-mist-light text-ink group-hover:bg-lime')} aria-hidden>
            {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </span>
        </span>
      </button>
      {open && <div className="pb-8">{children}</div>}
    </section>
  );
}
