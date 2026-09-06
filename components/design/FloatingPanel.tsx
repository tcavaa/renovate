'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A frosted panel that floats over the canvas. Scrolls inside itself; the canvas never moves. */
export function FloatingPanel({
  title,
  subtitle,
  onClose,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('glass flex max-h-full flex-col overflow-hidden rounded-2xl animate-fade-in', className)}>
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <h3 className="font-serif text-base font-semibold leading-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  );
}
