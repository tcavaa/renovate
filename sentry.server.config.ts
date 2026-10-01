import * as Sentry from '@sentry/nextjs';
import { setLogSink, type LogLevel } from '@/lib/log';
import { sentryOptions } from '@/lib/sentry';

/**
 * Sentry on the Node server, started by `instrumentation.ts` (docs/operations.md#errors-go-to-sentry).
 *
 * API routes catch their own exceptions in `handle()` and only log them, so Sentry would never
 * see them; the server's log is therefore forwarded whole. Every line goes to Sentry's Logs, and
 * an `error` line becomes an issue as well — its `Error` as the exception (so issues group by
 * stack), or the message itself when the line carries none (a payment that does not match its
 * order, a notification that failed).
 */
Sentry.init({
  ...sentryOptions,
  integrations: [
    // As the Next SDK sets it (Next's own spans cover requests), less the request sessions: their
    // `close` listener was the eleventh on each `/monitoring` response — Next's proxy pipes the
    // tunnel's answer and adds the rest — and Node warned of a leak on every browser event. The
    // tunnel's own calls were counted as sessions too.
    Sentry.httpIntegration({ disableIncomingRequestSpans: true, sessions: false }),
  ],
});

/** Log context as Sentry attributes: scalars as they are, an error as its message, the rest as JSON. */
function attributes(context: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (value instanceof Error) out[key] = `${value.name}: ${value.message}`;
    else {
      try {
        out[key] = JSON.stringify(value);
      } catch {
        out[key] = String(value);
      }
    }
  }
  return out;
}

function forward(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
  const attrs = attributes(context);
  Sentry.logger[level](msg, attrs);
  if (level !== 'error') return;
  const err = Object.values(context ?? {}).find((value) => value instanceof Error);
  const hint = {
    contexts: { log: { msg, ...attrs } },
    ...(typeof attrs.route === 'string' ? { tags: { route: attrs.route } } : {}),
  };
  if (err) Sentry.captureException(err, hint);
  else Sentry.captureMessage(msg, { ...hint, level: 'error' });
}

if (sentryOptions.enabled) setLogSink(forward);
