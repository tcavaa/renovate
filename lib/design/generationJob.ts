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
 * How long each stage's function may live (its route's `maxDuration`, from the request's start —
 * work after the answer counts towards it). Each stage has a function of its own.
 */
export const FUNCTION_MAX_MS = 300_000;

/**
 * How long the design stage waits for the check's request to be answered: the check's function
 * starts at most this long after the design stage entered `checking` (one that starts later finds
 * the job already ended — `NOT_STARTED` — and does nothing).
 */
export const REVIEW_START_MS = 20_000;

/**
 * A stage past this is a job whose function died: no function running it can be alive any more —
 * the design stage's began before the job was written, the check's at most `REVIEW_START_MS` after
 * its stage did, and each lives `FUNCTION_MAX_MS`. It is settled the next time it is read — a flat
 * laid out and not checked is opened as laid out, a design that never came is laid out by the
 * engine in the page.
 */
export const JOB_STALE_MS = FUNCTION_MAX_MS + REVIEW_START_MS;

/** The longest the style page can wait on a job: both stages to the end of their time, in whole minutes (the overlay's hint). */
export const JOB_MAX_MINUTES = Math.ceil((2 * JOB_STALE_MS) / 60_000);

/** How long the designer and the check may take on the server before they are let go, inside their functions. */
export const DESIGN_DEADLINE_MS = 240_000;
export const REVIEW_DEADLINE_MS = 200_000;

/** How often the style page asks after a running job. */
export const JOB_POLL_MS = 3_000;

/** The job's two steps, each in a function of its own: the designer's proposal, then its check of every room. */
export type JobStep = 'design' | 'check';

/**
 * Why a job's step ended other than as planned, kept on its row (`design_jobs.error`, as
 * `<step>:<code>[ <detail>]` — `jobError`, read back by `readJobError`):
 *
 * - `NO_DESIGN` — the project had no plan or design to work on;
 * - `CHANGED` — the design changed before the step's paid call, which was not made;
 * - `PROJECT_CHANGED` — the design changed while the call ran: its write found another revision;
 * - `PLAN_REQUIRED` / `WRITE_REFUSED` — the write was refused (the plan's locks; the save's own checks);
 * - `AI_FAILED` — the designer or the check failed (an error, a refusal, an answer that does not
 *   validate, its deadline): the engine's flat, or the flat as laid out, unchecked;
 * - `NOT_STARTED` — the check could not be started;
 * - `TIMEOUT` — the step's function died (`isStale`), settled when the job was next read;
 * - `ERROR` — the step itself threw.
 */
export type JobErrorCode = 'NO_DESIGN' | 'CHANGED' | 'PROJECT_CHANGED' | 'PLAN_REQUIRED' | 'WRITE_REFUSED' | 'AI_FAILED' | 'NOT_STARTED' | 'TIMEOUT' | 'ERROR';

/** The row's `error` column holds 500 characters. */
const JOB_ERROR_LENGTH = 480;

export function jobError(step: JobStep, code: JobErrorCode, detail?: string | null): string {
  return `${step}:${code}${detail ? ` ${detail}` : ''}`.slice(0, JOB_ERROR_LENGTH);
}

export function readJobError(error: string | null | undefined): { step: JobStep; code: JobErrorCode; detail: string | null } | null {
  const match = error ? /^(design|check):([A-Z_]+)(?: ([\s\S]*))?$/.exec(error) : null;
  return match ? { step: match[1] as JobStep, code: match[2] as JobErrorCode, detail: match[3] ?? null } : null;
}

/** Whether a job got as far as asking the designer (and so may have been paid for): every one but those that ended before the call. */
export function calledDesigner(job: { error: string | null }): boolean {
  const error = readJobError(job.error);
  return !(error?.step === 'design' && (error.code === 'NO_DESIGN' || error.code === 'CHANGED'));
}

/**
 * Whether a job wrote the designer's flat — the AI run the per-design cap (`MAX_AI_GENERATIONS`)
 * counts. Its proposal is kept on the row with the design stage's write and the job moves on to
 * the check (`checking`, then `done`); a proposal whose write was refused is kept on a `failed` job.
 * A designer that failed (the engine's flat), a write refused, a design changed, a function that
 * died: none is a run.
 */
export function wroteDesignersFlat(job: { stage: GenerationStage; hasProposal: boolean }): boolean {
  return job.hasProposal && (job.stage === 'checking' || job.stage === 'done');
}

/**
 * Why the AI designer did not design the flat, as the person is told in the overlay
 * (`GenerationOverlay` `fallback`): its runs for this design used up (`limit`), too many asked
 * in a short while (`paused`), the design changed while it worked (`changed`), or anything else
 * (`failed`).
 */
export type AiFallback = 'limit' | 'paused' | 'changed' | 'failed';

/**
 * Why a job ended with the engine's flat, or null when the designer's flat was laid out on the
 * server (checked or not — a check that failed still leaves the designer's design). With nothing
 * laid out on the server (`laidOut` false: the page lays the flat out with the engine) there is
 * always a reason, a check's ending too. No job at all is a failure only when the page lays the
 * flat out itself (the run it waited on is gone); a flat laid out on the server with no job behind
 * it (another tab's engine flat, a deployment with no key) asked no AI, so there is nothing to say.
 */
export function aiFallback(job: Pick<GenerationJobView, 'error'> | null, laidOut = true): AiFallback | null {
  if (!job) return laidOut ? null : 'failed';
  const error = readJobError(job.error);
  if (laidOut && (!error || error.step === 'check')) return null;
  return error?.code === 'CHANGED' || error?.code === 'PROJECT_CHANGED' ? 'changed' : 'failed';
}

/** Why the start route refused a job (`POST /api/design/ai-generate`: its status and `error`); no answer at all is status 0. */
export function startRefusal(status: number, error: string | null): AiFallback {
  if (status === 429) return error === 'AI_LIMIT' ? 'limit' : 'paused';
  if (status === 409) return 'changed';
  return 'failed';
}

export function isLive(stage: GenerationStage): boolean {
  return stage === 'designing' || stage === 'checking';
}

/** A job still in a running stage long after its function can have lived. */
export function isStale(job: { stage: GenerationStage; stageAt: Date | string }, now: Date = new Date()): boolean {
  return isLive(job.stage) && now.getTime() - new Date(job.stageAt).getTime() > JOB_STALE_MS;
}

/**
 * A job at work on the design right now: designing or checking, and not dead. While one is, the
 * design is the job's to write — the save route refuses every other save of it (`DESIGN_GENERATING`).
 */
export function jobRunning(job: { stage: GenerationStage; stageAt: Date | string } | null | undefined, now: Date = new Date()): boolean {
  return !!job && isLive(job.stage) && !isStale(job, now);
}

/** The save route's answer to a save of a design a job is generating (409): the browser keeps the change and says so. */
export const DESIGN_GENERATING = 'DESIGN_GENERATING';

/**
 * What the style page does with a job (the server has settled a dead one before answering):
 *
 * - `wait` — it is designing or checking: the overlay shows that stage, and the page asks again;
 * - `reload` — the server's design is laid out and this browser's is not: the design half is read
 *   from the server again and the studio opens (`dropCachedCopy`);
 * - `engine` — the job ended with nothing laid out (the designer and the engine both failed on
 *   the server, the job timed out, or the design changed under it): the page lays the flat out
 *   with the engine and says why (`aiFallback`). Only for the job this page is waiting on — the
 *   visit that started it, or found it running; a later visit to the style step finds the flat not
 *   laid out and waits for the person's press (a run that came to nothing used none of the
 *   design's AI runs, `wroteDesignersFlat`);
 * - `none` — nothing to do.
 *
 * `local` is this browser's design: laid out or not.
 */
export function generationAction(status: Pick<GenerationStatus, 'job' | 'designGenerated'>, local: { generated: boolean }, waiting: boolean): 'wait' | 'reload' | 'engine' | 'none' {
  const { job } = status;
  if (local.generated) return 'none';
  if (job && isLive(job.stage)) return 'wait';
  if (status.designGenerated) return 'reload';
  return waiting ? 'engine' : 'none';
}
