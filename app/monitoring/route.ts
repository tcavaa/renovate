import { rateLimit } from '@/lib/api/rateLimit';

/**
 * The browser's Sentry tunnel (docs/operations.md#errors-go-to-sentry): `instrumentation-client.ts`
 * sends its envelopes here, on the site's own origin, so the CSP needs no Sentry host and ad
 * blockers let them through.
 *
 * Our own route rather than `withSentryConfig`'s `tunnelRoute`: that is a rewrite which takes the
 * Sentry organisation and project from the query string — anyone could relay to any Sentry
 * project through this origin — and passes every request header on, the session cookie
 * included. Here an envelope goes only to the project of our own DSN, as its body alone, with a
 * size cap and a per-address rate. The answer is not the app's `{ data, error }` envelope: the
 * SDK reads only the status and Sentry's rate-limit headers, which are passed back.
 */

/** A replay segment is the largest thing the browser sends; it is compressed well under this. */
const MAX_BYTES = 2_000_000;
/** After an error the replay goes on recording, a segment every few seconds. */
const RULE = { key: 'monitoring', limit: 300, windowMs: 10 * 60_000 };

function target(): { url: string; dsn: URL } | null {
  const raw = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!raw) return null;
  try {
    const dsn = new URL(raw);
    const projectId = dsn.pathname.replace(/^\/+|\/+$/g, '');
    if (!projectId || !dsn.username) return null;
    return { url: `${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`, dsn };
  } catch {
    return null;
  }
}

/** The envelope's DSN (its first line is a JSON header) is ours: same host, project and key. */
function isOurs(body: Uint8Array, ours: URL): boolean {
  const end = body.indexOf(0x0a);
  const head = new TextDecoder().decode(end === -1 ? body : body.subarray(0, end));
  try {
    const header = JSON.parse(head) as { dsn?: unknown };
    if (typeof header.dsn !== 'string') return false;
    const theirs = new URL(header.dsn);
    return theirs.host === ours.host && theirs.username === ours.username && theirs.pathname.replace(/\/+$/, '') === ours.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const sentry = target();
  if (!sentry) return new Response(null, { status: 404 });

  const limited = rateLimit(req, RULE);
  if (!limited.ok) return new Response(null, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return new Response(null, { status: 413 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  if (!isOurs(body, sentry.dsn)) return new Response(null, { status: 400 });

  try {
    const upstream = await fetch(sentry.url, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-sentry-envelope' },
      signal: AbortSignal.timeout(10_000),
    });
    const headers = new Headers();
    for (const name of ['retry-after', 'x-sentry-rate-limits']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(null, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
