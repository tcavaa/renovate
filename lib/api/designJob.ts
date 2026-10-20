import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DesignJob, Project } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { getDesignCatalog } from '@/lib/api/designCatalog';
import { designWriteColumns, refusedDesignChange } from '@/lib/api/designWrite';
import { claimJob, latestJob, loadJob, loadProject, ownedProject, projectGenerated, updateJob, userRole, withJobLock, writeDesignForJob, type JobUpdate } from '@/lib/api/designJobRows';
import { designWithClaude } from '@/lib/design/aiDesign';
import { reviewWithClaude, type AiReview } from '@/lib/design/aiReview';
import { MAX_AI_GENERATIONS, type AiProposal } from '@/lib/design/aiProposal';
import { getArchetype } from '@/lib/design/catalog';
import { picksFromCalculator } from '@/lib/design/fromCalculator';
import { generateScene, reviewedScene } from '@/lib/design/generateScene';
import { DESIGN_DEADLINE_MS, REVIEW_DEADLINE_MS, isLive, isStale, type GenerationJobView, type GenerationStatus } from '@/lib/design/generationJob';
import { randomSeed } from '@/lib/design/random';
import { ensureWalls } from '@/lib/design/walls';
import type { DesignProgress, DesignScene, FloorPlan } from '@/lib/design/types';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { UserRole } from '@/lib/auth/roles';
import { calculatorPickIds, refusedSceneChange } from '@/lib/plans/sceneGuard';

/**
 * The AI designer's generation as a job on the server (docs/design-studio/decor.md#the-ai-designer),
 * so that a flat asked for is furnished and checked whether or not the page that asked stays open —
 * a closed tab, a dropped connection — and the page that comes back finds it done.
 *
 * Two invocations, each inside its own function's 300 s (work after the answer counts towards the
 * function that answered, from the request's start, and the designer and the check together run
 * close to it):
 *
 * 1. `POST /api/design/ai-generate` starts a job (`startDesignJob`: the design's revision as the
 *    page saved it, the per-design cap counted here, one job at a time) and answers at once; after
 *    the answer `runDesignStage` asks the designer, lays the flat out (`generateScene`, the same
 *    function the browser's store runs), writes it — not yet laid out (`progress.generated` false)
 *    — and starts the check with a request of its own.
 * 2. `POST /api/design/ai-review` (the server's own request, signed with `jobToken`) answers at once;
 *    after the answer `runReviewStage` has the designer check every room, applies its fixes and
 *    writes the flat laid out.
 *
 * Every write is a design save made on the server (`designWriteColumns`: repriced, its budget
 * worked out, the calculation's columns left alone), over the revision the job started from, in one
 * transaction with the job's stage — so a design changed under the job is never written over, and
 * the job's stage never says more or less than the row holds. A designer that fails or times out
 * leaves the flat to the engine, laid out and done; a check that fails leaves the flat as laid out.
 * A job whose function died is settled when it is next read (`settleStaleJob`).
 */

type Locale = 'ka' | 'en' | 'ru';

/** The headers the design stage signs its request for the check with. */
export const JOB_HEADER = 'x-design-job';
export const JOB_TOKEN_HEADER = 'x-design-job-token';

/** A server-only signature of a job's id: only the server itself starts a job's check. */
export function jobToken(jobId: number): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`design-job:${jobId}`).digest('hex');
}

export function validJobToken(jobId: number, token: string | null): boolean {
  const want = Buffer.from(jobToken(jobId));
  const got = Buffer.from(token ?? '');
  return got.length === want.length && timingSafeEqual(got, want);
}

export function jobView(job: DesignJob): GenerationJobView {
  const review = job.review as AiReview | null;
  return {
    id: job.id,
    stage: job.stage,
    createdAt: job.createdAt.toISOString(),
    stageAt: job.stageAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    error: job.error,
    reviewed: review ? review.fixes.length : null,
  };
}

const errorText = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 480);

/** The journey after the flat is laid out: generated, and on to the studio. */
function laidOutProgress(progress: DesignProgress | undefined): DesignProgress {
  return { ...(progress ?? { step: 4, generated: false }), generated: true, step: 5, at: 5 };
}

/** A flat carried in from the calculator applies the calculation's picks, as the browser's store does (`loadDesignHalf`). */
function calculatorPicksOf(project: Project, scene: DesignScene) {
  if (!scene.progress?.planFromCalculator || project.selectedProducts == null) return null;
  return picksFromCalculator(project.selectedProducts as Record<string, SelectedProduct>, (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>);
}

export type StartResult =
  | { ok: true; job: DesignJob; started: boolean }
  | { ok: false; error: 'PROJECT_NOT_FOUND' | 'PROJECT_CHANGED' | 'AI_LIMIT' | 'PLAN_REQUIRED' | 'NO_ROOMS'; status: number; feature?: string; plan?: string | null };

/**
 * Starts a generation for one of the account's projects, or hands back the one already running
 * (two clicks, two tabs: one job, one bill). The design must be at `baseRev` — what the page saved
 * just before — and under the per-design cap of AI runs (`MAX_AI_GENERATIONS`, counted from the
 * jobs here, so a repeat cannot bill past it). Laying out a flat already laid out is the studio's
 * catalogue on the plan's locks, as in the save route.
 */
export async function startDesignJob(account: { id: number; role?: UserRole | null }, input: { projectId: number; baseRev: number; locale: Locale }): Promise<StartResult> {
  // A job whose function died is settled before anything is counted or compared.
  await settleStaleJob(input.projectId);
  const owned = await ownedProject(input.projectId, account.id);
  if (!owned) return { ok: false, error: 'PROJECT_NOT_FOUND', status: 404 };
  const plan = owned.plan as FloorPlan | null;
  const scene = owned.scene as DesignScene | null;
  if (!plan || plan.rooms.length === 0 || !scene) return { ok: false, error: 'NO_ROOMS', status: 400 };
  const refused = await refusedDesignChange(owned, { plan, scene: { ...scene, generation: { by: 'ai', at: new Date().toISOString() } } }, account);
  if (refused) return { ok: false, error: 'PLAN_REQUIRED', status: 402, feature: refused.feature, plan: refused.plan };

  return withJobLock(input.projectId, async ({ latest, designRev, jobCount, insert }): Promise<StartResult> => {
    if (latest && isLive(latest.stage) && !isStale(latest)) return { ok: true, job: latest, started: false };
    if (designRev !== input.baseRev) return { ok: false, error: 'PROJECT_CHANGED', status: 409 };
    const done = Math.max(scene.generation?.aiCount ?? 0, jobCount);
    if (done >= MAX_AI_GENERATIONS) return { ok: false, error: 'AI_LIMIT', status: 429 };
    const job = await insert({ projectId: input.projectId, userId: account.id, locale: input.locale, baseRev: input.baseRev, seed: randomSeed(), aiCount: done + 1 });
    return { ok: true, job, started: true };
  });
}

/**
 * Writes the flat the job made into the project, over the revision `expectRev`, and moves the job
 * on in the same transaction. The plan's locks hold: a generation over a flat not laid out passes
 * on every plan (checked with none of the studio's features), anything else on the account's own.
 */
async function writeFlat(job: DesignJob, project: Project, plan: FloorPlan, scene: DesignScene, options: { expectRev: number; stage: 'design' | 'review'; jobUpdate: JobUpdate; versions?: [] }): Promise<{ ok: true } | { ok: false; error: string }> {
  const stored = { plan: project.plan as FloorPlan | null, scene: project.scene as DesignScene | null };
  if (refusedSceneChange(stored, { plan, scene }, { catalog: false, moveFurniture: false, picks: calculatorPickIds(project.selectedProducts, project.selectedFurniture) })) {
    const role = job.userId ? await userRole(job.userId) : null;
    const refused = job.userId && role ? await refusedDesignChange(project, { plan, scene }, { id: job.userId, role }) : { feature: 'catalog' };
    if (refused) return { ok: false, error: `PLAN_REQUIRED ${refused.feature}` };
  }
  const write = await designWriteColumns(project, { plan, scene, homeState: project.homeState, floorPlanUrl: project.floorPlanUrl, versions: options.versions, draft: true });
  if (!write.ok) return { ok: false, error: write.error };
  const written = await writeDesignForJob(project.id, options.expectRev, write.set, `job-${job.id}-${options.stage}`, job.id, options.jobUpdate);
  return written ? { ok: true } : { ok: false, error: 'PROJECT_CHANGED' };
}

async function endJob(jobId: number, update: JobUpdate): Promise<void> {
  const now = new Date();
  await updateJob(jobId, { stageAt: now, finishedAt: now, ...update });
}

/**
 * The first invocation's work, after its answer: the designer's proposal (or none — the engine's
 * flat), the flat laid out as the browser would lay it, written. With a proposal the flat is
 * written not yet laid out and the check is started; without one it is written laid out, done.
 */
export async function runDesignStage(jobId: number, origin: string): Promise<void> {
  const job = await loadJob(jobId);
  if (!job || job.stage !== 'designing') return;
  try {
    const project = await loadProject(job.projectId);
    if (!project?.plan || !project.scene) return endJob(job.id, { stage: 'failed', error: 'NO_DESIGN' });
    const plan = ensureWalls(project.plan as FloorPlan);
    const saved = project.scene as DesignScene;
    const { products: catalog } = await getDesignCatalog();

    let proposal: AiProposal | null = null;
    let designError: string | null = null;
    try {
      // The flat's design so far (what the person has): offered rarely again, so "generate" a
      // second time is a new design and not the same one reshuffled.
      const previous = {
        productIds: [...(saved.items ?? []).map((i) => i.product?.productId), ...(saved.finishes ?? []).map((f) => f.product?.productId)].filter((id): id is number => typeof id === 'number'),
        decorFamilies: (saved.decor ?? []).map((d) => d.family),
      };
      const answer = await designWithClaude({
        plan,
        styleId: saved.styleId,
        styleProfile: saved.styleProfile ?? null,
        budgetGel: saved.budgetGel ?? null,
        locale: job.locale as Locale,
        catalog,
        previous,
        seed: job.seed,
        signal: AbortSignal.timeout(DESIGN_DEADLINE_MS),
      });
      proposal = answer.proposal;
      log.info('ai-generate', { projectId: project.id, jobId: job.id, rooms: plan.rooms.length, decor: proposal.rooms.reduce((n, r) => n + r.decor.length, 0), ...answer.usage });
    } catch (err) {
      designError = errorText(err);
      log.warn('ai-generate failed, the engine lays the flat out', { projectId: project.id, jobId: job.id, err });
    }

    const laid = generateScene({
      plan,
      styleId: saved.styleId,
      budgetGel: saved.budgetGel ?? null,
      catalog,
      proposal,
      finishes: saved.finishes ?? [],
      electrical: saved.electrical ?? [],
      calculatorPicks: calculatorPicksOf(project, saved),
      seed: job.seed,
      at: new Date().toISOString(),
      aiCount: job.aiCount,
    });
    const now = new Date();
    const scene: DesignScene = {
      ...saved,
      items: laid.items,
      finishes: laid.finishes,
      decor: laid.decor,
      electrical: laid.electrical,
      generation: laid.generation,
      // Laid out only once it is checked: until then a page that opens the project waits on the
      // style step, and the check's write is the generation's own (`refusedSceneChange`).
      progress: proposal ? { ...(saved.progress ?? { step: 4 }), generated: false } : laidOutProgress(saved.progress),
    };
    const written = await writeFlat(job, project, laid.plan, scene, {
      expectRev: job.baseRev,
      stage: 'design',
      // The versions kept for an earlier layout describe a flat that no longer exists.
      versions: [],
      jobUpdate: proposal ? { stage: 'checking', proposal, stageAt: now } : { stage: 'done', error: designError, stageAt: now, finishedAt: now },
    });
    if (!written.ok) {
      log.warn('design job could not write the flat', { projectId: project.id, jobId: job.id, error: written.error });
      return endJob(job.id, { stage: 'failed', error: written.error });
    }
    if (proposal && !(await startReview(job.id, origin))) await finishFlat(job.id, null, 'REVIEW_NOT_STARTED');
  } catch (err) {
    log.error('design job failed', { jobId: job.id, err });
    await endJob(job.id, { stage: 'failed', error: errorText(err) }).catch(() => undefined);
  }
}

/** The check, in an invocation of its own (`POST /api/design/ai-review`): answered at once, run after. */
async function startReview(jobId: number, origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/api/design/ai-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [JOB_HEADER]: String(jobId), [JOB_TOKEN_HEADER]: jobToken(jobId) },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) log.warn('design job: the check was not started', { jobId, status: res.status });
    return res.ok;
  } catch (err) {
    log.warn('design job: the check was not started', { jobId, err });
    return false;
  }
}

/** The second invocation's work: the designer checks every room it furnished, and the flat is written laid out. */
export async function runReviewStage(jobId: number): Promise<void> {
  const job = await loadJob(jobId);
  if (!job || job.stage !== 'checking') return;
  try {
    const project = await loadProject(job.projectId);
    if (!project?.plan || !project.scene) return endJob(job.id, { stage: 'failed', error: 'NO_DESIGN' });
    const saved = project.scene as DesignScene;
    let review: AiReview | null = null;
    let reviewError: string | null = null;
    try {
      const { products: catalog } = await getDesignCatalog();
      // The pieces the check can read: each with its product and a kind the engine knows (fixes apply to every piece).
      const items = saved.items.filter((i) => i.product && getArchetype(i.kind));
      const answer = await reviewWithClaude({ plan: ensureWalls(project.plan as FloorPlan), items, decor: saved.decor ?? [], styleId: saved.styleId, locale: job.locale as Locale, catalog, signal: AbortSignal.timeout(REVIEW_DEADLINE_MS) });
      review = answer.review;
      log.info('ai-review', { projectId: project.id, jobId: job.id, items: items.length, fixes: review.fixes.length, ...answer.usage });
    } catch (err) {
      reviewError = errorText(err);
      log.warn('ai-review failed, the flat stays as laid out', { projectId: project.id, jobId: job.id, err });
    }
    await finishFlat(job.id, review, reviewError);
  } catch (err) {
    log.error('design job check failed', { jobId: job.id, err });
    await endJob(job.id, { stage: 'failed', error: errorText(err) }).catch(() => undefined);
  }
}

/**
 * The flat the design stage wrote, written laid out — with the check's fixes when there is a
 * review, as laid out when there is none (the check failed, timed out or never started). Over the
 * design stage's revision only: a design changed since is left as it is (the job ends without it).
 */
async function finishFlat(jobId: number, review: AiReview | null, error: string | null): Promise<void> {
  const job = await loadJob(jobId);
  const project = job ? await loadProject(job.projectId) : null;
  if (!job || !project?.plan || !project.scene) return;
  const plan = ensureWalls(project.plan as FloorPlan);
  const saved = project.scene as DesignScene;
  const now = new Date();
  if (project.designRev !== job.baseRev + 1) return endJob(job.id, { stage: 'done', review, error: 'PROJECT_CHANGED' });
  const fixed = review && saved.generation ? reviewedScene({ plan, items: saved.items, decor: saved.decor ?? [], generation: saved.generation }, review, (await getDesignCatalog()).products) : null;
  const scene: DesignScene = { ...saved, ...(fixed ?? {}), progress: laidOutProgress(saved.progress) };
  const written = await writeFlat(job, project, plan, scene, { expectRev: job.baseRev + 1, stage: 'review', jobUpdate: { stage: 'done', review, error, stageAt: now, finishedAt: now } });
  if (!written.ok) {
    log.warn('design job could not write the checked flat', { projectId: project.id, jobId: job.id, error: written.error });
    await endJob(job.id, { stage: 'done', review, error: written.error });
  }
}

/**
 * A job whose function died (`isStale`), settled: one that was designing wrote nothing and has
 * failed — the page lays the flat out with the engine; one that was checking had written the flat,
 * which is now written laid out, unchecked. Claimed first (its `stageAt` moved on), so two readers
 * settle it once.
 */
export async function settleStaleJob(projectId: number, now: Date = new Date()): Promise<DesignJob | null> {
  const job = await latestJob(projectId);
  if (!job || !isStale(job, now)) return job;
  const claimed = await claimJob(job, job.stage === 'designing' ? { stage: 'failed', error: 'TIMEOUT', stageAt: now, finishedAt: now } : { stageAt: now });
  if (claimed && job.stage === 'checking') {
    log.warn('design job: the check never finished, the flat opens as laid out', { projectId, jobId: job.id });
    await finishFlat(job.id, null, 'REVIEW_TIMEOUT');
  }
  return loadJob(job.id);
}

/**
 * What the style page asks every few seconds: the project's last job (a dead one settled first) and
 * whether its design is laid out on the server. Null when the project is not the account's. Reads
 * the row's small columns only — the scene is large.
 */
export async function generationStatus(projectId: number, userId: number): Promise<Omit<GenerationStatus, 'enabled'> | null> {
  if (!(await projectGenerated(projectId, userId))) return null;
  const job = await settleStaleJob(projectId);
  // Read after the settling, which may have laid the flat out.
  const row = await projectGenerated(projectId, userId);
  return { job: job ? jobView(job) : null, designGenerated: row?.generated === true };
}
