import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';

/**
 * Sentry in the browser (docs/operations.md#errors-go-to-sentry). Uncaught errors and rejected
 * promises are sent on their own; the error boundaries (`app/(main)/error.tsx`,
 * `app/global-error.tsx`) send what they catch. Events go through `/monitoring` on this origin
 * (`tunnelRoute` in next.config.mjs), so the CSP needs no Sentry host and ad blockers let them by.
 *
 * Replay keeps the last minute in memory and sends it only with an error, every text, input and
 * image masked; the 3D canvas is not recorded. Flitt's card form is another origin's iframe and
 * is never recorded either.
 */
Sentry.init({
  ...sentryOptions,
  integrations: [Sentry.replayIntegration()],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
