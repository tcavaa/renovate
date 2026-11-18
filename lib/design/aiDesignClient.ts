/**
 * The browser's side of the AI designer: whether it is there, starting a generation on the server
 * (`lib/api/designJob`), and asking after it. The server lays the flat out and checks it whether
 * the page stays open or not; the page only waits, and reads the design again when it is done.
 * A start that does not go through says why (`startRefusal`) — the page then lays the flat out with
 * the engine and tells the person so.
 */

import { startRefusal, type AiFallback, type GenerationJobView, type GenerationStatus } from './generationJob';

/** Whether the designer is there, the project's last generation job, and whether its design is laid out on the server; null on any failure. */
export async function generationStatus(projectId: number): Promise<GenerationStatus | null> {
  try {
    const res = await fetch(`/api/design/ai-generate?projectId=${projectId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: GenerationStatus };
    return body.data ? { enabled: !!body.data.enabled, job: body.data.job ?? null, designGenerated: !!body.data.designGenerated } : null;
  } catch {
    return null;
  }
}

/**
 * Starts the designer on the design as it was just saved (`baseRev`). The job that runs — a new
 * one, or the one already running for this project — or why there is none: the design's AI runs
 * used up, too many asked in a short while, the design changed since, anything else (no key, the
 * server unreachable); the page lays the flat out with the engine.
 */
export async function startAiGeneration(input: { projectId: number; baseRev: number; locale: 'ka' | 'en' | 'ru' }): Promise<{ job: GenerationJobView } | { refused: AiFallback }> {
  try {
    const res = await fetch('/api/design/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as { data?: { job?: GenerationJobView } | null; error?: string | null } | null;
    const job = res.ok ? body?.data?.job : null;
    return job ? { job } : { refused: startRefusal(res.status, body?.error ?? null) };
  } catch {
    return { refused: startRefusal(0, null) };
  }
}
