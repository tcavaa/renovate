import type { NextRequest } from 'next/server';
import { handlers } from '@/auth';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';

export const { GET } = handlers;

/**
 * Only the credentials callback is throttled — that is the endpoint a password-guessing
 * script hits. Sign-out, CSRF and the OAuth callbacks stay unthrottled so a legitimate user
 * is never locked out of leaving.
 */
export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    const limited = rateLimited(req, RATE_RULES.login);
    if (limited) return limited;
  }
  return handlers.POST(req);
}
