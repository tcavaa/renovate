/**
 * Sentry, the error tracker (docs/operations.md#errors-go-to-sentry): the options the browser
 * (`instrumentation-client.ts`) and the Node server (`sentry.server.config.ts`) both start it
 * with. Nothing in the app runs on the edge runtime — Next 16's proxy is Node — so there is no
 * third set.
 *
 * Off without `NEXT_PUBLIC_SENTRY_DSN`, like every other key: the SDK is initialised disabled
 * and every capture is a no-op. The DSN is `NEXT_PUBLIC_` because the browser sends with it too
 * (it only lets one send events, so it is not a secret), and Next inlines it at build time — a
 * deploy sets it where the build runs, not only where the server runs.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

export const sentryOptions = {
  dsn,
  // Vitest runs with NODE_ENV=test; a DSN in .env.local must not turn the unit tests into events.
  enabled: !!dsn && process.env.NODE_ENV !== 'test',
  // `production` on cPanel and the VPS, `development` locally. NEXT_PUBLIC_SENTRY_ENVIRONMENT
  // names a host when two share a label (a staging box built in production mode).
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // Every error is sent; traces are sampled. A studio visit alone is about a hundred spans (one
  // per model and texture), so production keeps one in five.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1,
  // The server's log lines go to Sentry's Logs as well (`setLogSink` in lib/log.ts).
  enableLogs: true,
  // No IP addresses, cookies or request bodies: a signed-in person's events carry their user id
  // only where the code sets it.
  sendDefaultPii: false,
};
