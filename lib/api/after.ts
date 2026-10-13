import { after } from 'next/server';

/**
 * Work that should not hold the answer up but must still happen: run after the response, which
 * Vercel keeps the function alive for (a fire-and-forget promise may be frozen with it the moment
 * the answer is sent). Outside a request — a test calling a handler, a script — it starts at once
 * instead, unawaited.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}
