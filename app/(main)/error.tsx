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
      <h1 className="font-serif text-3xl font-bold text-danger">{ka.common.error}</h1>
      <p className="mt-3 text-ink-muted">{error.message}</p>
      <Button onClick={reset} className="mt-8">
        {ka.common.retry}
      </Button>
    </div>
  );
}
