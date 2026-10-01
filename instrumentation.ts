import * as Sentry from '@sentry/nextjs';

/**
 * Next calls `register()` once when a server starts. Sentry's Node SDK is the only thing set up
 * here (docs/operations.md#errors-go-to-sentry); there is no edge runtime to cover.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
}

/**
 * An error a page, a layout, a server action or the proxy did not catch. API routes catch their
 * own in `handle()` (lib/api/route.ts), whose `log.error` line reaches Sentry instead.
 */
export const onRequestError = Sentry.captureRequestError;
