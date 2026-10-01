'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * An error in the root layout itself, which replaces the whole document — so no locale and no
 * dictionary are left to render with, and the page is Next's own error page, as it was before
 * this file existed. It is here to send the error to Sentry (docs/operations.md#errors-go-to-sentry).
 * Errors inside a page are caught lower down, by `app/(main)/error.tsx`.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* `statusCode` 0: the generic "application error" text; App Router has no status here. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
