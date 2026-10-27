'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const ka = useT();
  // A boundary that catches an error keeps it from the browser's error handler, so Sentry is told here.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="container py-24 text-center">
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-bg-surface px-6 py-12 shadow-card md:px-12">
        <span className="arch mx-auto mb-7 block h-16 w-12 bg-brand/15" aria-hidden />
        <h1 className="font-serif text-3xl font-semibold text-danger">{ka.common.error}</h1>
        <p className="mt-3 text-ink-muted">{error.message}</p>
        <Button onClick={reset} className="mt-8">
          {ka.common.retry}
        </Button>
      </div>
    </div>
  );
}
