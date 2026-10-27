'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Shown when a step is opened before the one before it was completed; `href` is the step to go back to. */
export function EmptyStep({ message, back, href }: { message: string; back: string; href: string }) {
  return (
    <div className="container py-24">
      <div className="mx-auto max-w-md rounded-3xl border border-line bg-bg-surface p-10 text-center shadow-card">
        <span className="mx-auto mb-6 flex w-fit gap-1" aria-hidden>
          {['bg-sand', 'bg-stone', 'bg-wood', 'bg-brand', 'bg-olive-light', 'bg-charcoal'].map((c) => (
            <span key={c} className={`h-2 w-5 rounded-full ${c}`} />
          ))}
        </span>
        <p className="text-ink-muted">{message}</p>
        <Button asChild variant="ink" className="mt-6">
          <Link href={href}>{back}</Link>
        </Button>
      </div>
    </div>
  );
}
