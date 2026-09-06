'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Shown when a step is opened before the one before it was completed. */
export function EmptyStep({ message, back, href = '/calculator' }: { message: string; back: string; href?: string }) {
  return (
    <div className="container py-24">
      <div className="mx-auto max-w-md border border-line bg-bg-surface p-10 text-center">
        <p className="text-ink-muted">{message}</p>
        <Button asChild variant="ink" className="mt-6">
          <Link href={href}>{back}</Link>
        </Button>
      </div>
    </div>
  );
}
