/**
 * Where to send someone after they sign in or register.
 *
 * `callbackUrl` arrives in the query string and is attacker-controlled: a link to
 * `/login?callbackUrl=https://evil.example` would otherwise bounce a freshly signed-in user
 * to a phishing page. Only a same-origin path is honoured; anything else falls back to `/`.
 */
export function safeCallbackUrl(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  // A single leading slash, not `//host` (protocol-relative) and not `/\host` (browsers
  // normalise the backslash to a slash).
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // No scheme smuggled in via a URL that only *looks* like a path.
  try {
    const url = new URL(value, 'http://placeholder.local');
    if (url.origin !== 'http://placeholder.local') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
