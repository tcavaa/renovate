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

import type { init } from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/** Context keys whose value never leaves the server: who someone is, how to reach them, a secret. */
const SECRET_KEY = /^(to|cc|bcc|text|html|phone|address|ip|cookie|authorization|signature)$|e-?mail|password|token|secret/i;
const EMAIL = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[a-z]{2,}/gi;
/** A link's one-time token (`/reset-password?token=…`, `/api/auth/verify?token=…`). */
const TOKEN_PARAM = /(\b(?:token|code|key|signature)=)[^&\s"']+/gi;

/** An e-mail address or a link's token taken out of a free text (a message, an error, a JSON blob). */
export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(TOKEN_PARAM, '$1[redacted]');
}

/**
 * Log context made fit for a third party: a personal or secret key's value replaced, and e-mail
 * addresses and link tokens taken out of every other string. The local log file keeps the line
 * whole — it is the operator's (and, with `MAIL_DRIVER=log`, where a reset link is read from).
 */
export function scrubContext<T>(context: Record<string, T> | undefined): Record<string, T | string> | undefined {
  if (!context) return context;
  const out: Record<string, T | string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) out[key] = value;
    else if (SECRET_KEY.test(key)) out[key] = '[redacted]';
    else if (typeof value === 'string') out[key] = scrubText(value);
    else if (value instanceof Error) out[key] = `${value.name}: ${scrubText(value.message)}`;
    else if (typeof value === 'object') {
      try {
        out[key] = scrubText(JSON.stringify(value, (k, v: unknown) => (k && SECRET_KEY.test(k) ? '[redacted]' : v)));
      } catch {
        out[key] = '[unserialisable]';
      }
    } else out[key] = value;
  }
  return out;
}

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
  // What the SDK may collect on its own. Since SDK 11 `sendDefaultPii` is gone and every one of
  // these defaults to on — IPs, cookies, headers, request and response bodies, query strings (a
  // reset link's token), bound SQL parameters (e-mails, password hashes), stack locals. So each
  // is off here, and only harmless request headers are kept. `satisfies` below makes a key the
  // SDK no longer knows a type error rather than a silent no-op.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ['user-agent', 'content-type', 'accept-language'] }, response: false },
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
    graphQL: { document: false, variables: false },
    queues: false,
  },
  // The last word on each log line and event: e-mails and link tokens out of what is left.
  beforeSendLog: (entry) => ({
    ...entry,
    message: typeof entry.message === 'string' ? scrubText(entry.message) : entry.message,
    attributes: scrubContext(entry.attributes),
  }),
  beforeSend: (event) => {
    if (event.message) event.message = scrubText(event.message);
    for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value);
    if (event.request?.url) event.request.url = scrubText(event.request.url);
    return event;
  },
} satisfies Parameters<typeof init>[0];
