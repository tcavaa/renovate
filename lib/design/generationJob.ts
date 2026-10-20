/**
 * The server's generation of a flat (`lib/api/designJob`, table `design_jobs`) as the style page
 * sees it — pure and isomorphic, so the page's choices are tested without a server: how long a
 * stage may last before the job is taken for dead, how often the page asks, and what the page does
 * with what it is told (`generationAction`).
 */

export type GenerationStage = 'designing' | 'checking' | 'done' | 'failed';

/** A job as `GET /api/design/ai-generate?projectId=` answers it. */
export interface GenerationJobView {
  id: number;
  stage: GenerationStage;
  /** ISO times: when it was started, when it entered its stage, when it ended. */
  createdAt: string;
  stageAt: string;
  finishedAt: string | null;
  /** What went wrong — the designer, the check or the write; a `done` job may carry one (the engine's flat, or no check). */
  error: string | null;
  /** The fixes the check made; null when it did not run. */
  reviewed: number | null;
}

/** What the style page is told: is the designer there, the project's last job, and is its design laid out on the server. */
export interface GenerationStatus {
  enabled: boolean;
  job: GenerationJobView | null;
  /** The row's design is laid out (`scene.progress.generated`). */
  designGenerated: boolean;
}

/**
 * A stage past this is a job whose function died (a Vercel function runs 300 s at most, and each
 * stage has one of its own): it is settled the next time it is read — a flat laid out and not
 * checked is opened as laid out, a design that never came is laid out by the engine in the page.
 */
export const JOB_STALE_MS = 6 * 60_000;

/** How long the designer and the check may take on the server before they are let go, inside a 300 s function. */
export const DESIGN_DEADLINE_MS = 240_000;
export const REVIEW_DEADLINE_MS = 200_000;

/** How often the style page asks after a running job. */
export const JOB_POLL_MS = 3_000;

export function isLive(stage: GenerationStage): boolean {
  return stage === 'designing' || stage === 'checking';
}

/** A job still in a running stage long after its function can have lived. */
export function isStale(job: { stage: GenerationStage; stageAt: Date | string }, now: Date = new Date()): boolean {
  return isLive(job.stage) && now.getTime() - new Date(job.stageAt).getTime() > JOB_STALE_MS;
}

/**
 * What the style page does with a job (the server has settled a dead one before answering):
 *
 * - `wait` — it is designing or checking: the overlay shows that stage, and the page asks again;
 * - `reload` — the server's design is laid out and this browser's is not: the design half is read
 *   from the server again and the studio opens (`dropCachedCopy`);
 * - `engine` — the job ended with nothing laid out (the designer and the engine both failed on
 *   the server, the job timed out, or the design changed under it): the page lays the flat out
 *   with the engine, as a failed AI call always did. Only for the job this page is waiting on, or
 *   for a failed job newer than this browser's last generation — an old one is history;
 * - `none` — nothing to do.
 *
 * `local` is this browser's design: laid out or not, and when its last generation was.
 */
export function generationAction(
  status: Pick<GenerationStatus, 'job' | 'designGenerated'>,
  local: { generated: boolean; generatedAt: string | null },
  waiting: boolean
): 'wait' | 'reload' | 'engine' | 'none' {
  const { job } = status;
  if (local.generated) return 'none';
  if (job && isLive(job.stage)) return 'wait';
  if (status.designGenerated) return 'reload';
  if (!job) return waiting ? 'engine' : 'none';
  if (waiting) return 'engine';
  const newer = !local.generatedAt || Date.parse(local.generatedAt) < Date.parse(job.createdAt);
  return job.stage === 'failed' && newer ? 'engine' : 'none';
}
