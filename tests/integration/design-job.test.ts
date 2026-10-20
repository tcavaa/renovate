import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignJob, Project } from '@/lib/db/schema';
import type { AiProposal } from '@/lib/design/aiProposal';
import type { AiReview } from '@/lib/design/aiReview';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { generationAction, JOB_STALE_MS } from '@/lib/design/generationJob';
import { GENERATION_CATALOG, generationPlan, generationProposal } from '../helpers/generation';

/**
 * The AI generation as a job on the server (`lib/api/designJob`), with its rows in memory and
 * Claude answering what each test says: the two stages in two invocations — the design written not
 * yet laid out, then the check's write laid out, each over its own revision — the engine's flat when
 * the designer fails, the flat as laid out when the check fails or never starts, nothing written over
 * a design changed under the job, one job at a time within the cap, a dead job settled when read,
 * and the plan's locks holding on a Free account. The check is started by the server's own signed
 * request to the real `POST /api/design/ai-review`.
 */

type JobRow = DesignJob;
const rows = vi.hoisted(() => ({ project: null as unknown as Record<string, unknown>, jobs: [] as Array<Record<string, unknown>>, nextId: 1 }));
const clone = <T,>(value: T): T => structuredClone(value);

vi.mock('@/lib/api/designJobRows', () => {
  const project = () => rows.project as unknown as Project;
  const jobsOf = (projectId: number) => rows.jobs.filter((j) => j.projectId === projectId) as unknown as JobRow[];
  const find = (id: number) => rows.jobs.find((j) => j.id === id) as unknown as JobRow | undefined;
  return {
    loadJob: async (id: number) => clone(find(id) ?? null),
    latestJob: async (projectId: number) => clone(jobsOf(projectId).at(-1) ?? null),
    loadProject: async (id: number) => (project().id === id ? clone(project()) : null),
    ownedProject: async (id: number, userId: number) => (project().id === id && project().userId === userId ? clone(project()) : null),
    projectGenerated: async (id: number, userId: number) =>
      project().id === id && project().userId === userId ? { generated: (project().scene as DesignScene | null)?.progress?.generated === true } : null,
    userRole: async () => 'user',
    withJobLock: async <T,>(projectId: number, fn: (locked: unknown) => Promise<T>) =>
      fn({
        latest: clone(jobsOf(projectId).at(-1) ?? null),
        designRev: project().designRev,
        jobCount: jobsOf(projectId).length,
        insert: async (job: Partial<JobRow>) => {
          const now = new Date();
          const row = { id: rows.nextId++, stage: 'designing', proposal: null, review: null, error: null, createdAt: now, stageAt: now, finishedAt: null, ...job };
          rows.jobs.push(row);
          return clone(row);
        },
      }),
    updateJob: async (id: number, update: Partial<JobRow>) => void Object.assign(find(id)!, update),
    claimJob: async (job: Pick<JobRow, 'id' | 'stage' | 'stageAt'>, update: Partial<JobRow>) => {
      const row = find(job.id)!;
      if (row.stage !== job.stage || row.stageAt.getTime() !== new Date(job.stageAt).getTime()) return false;
      Object.assign(row, update);
      return true;
    },
    writeDesignForJob: async (projectId: number, expectRev: number, set: Record<string, unknown>, saveId: string, jobId: number, jobUpdate: Partial<JobRow>) => {
      if (project().id !== projectId || project().designRev !== expectRev) return false;
      rows.project = { ...rows.project, ...clone(set), designRev: expectRev + 1, designSaveId: saveId };
      Object.assign(find(jobId)!, jobUpdate);
      return true;
    },
  };
});

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('@/lib/api/designCatalog', () => ({ getDesignCatalog: async () => ({ products: GENERATION_CATALOG, stores: [], shelf: null }) }));

// The design write's columns as the save route would set them; its repricing has its own tests (save-routes).
vi.mock('@/lib/api/designWrite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/designWrite')>()),
  designWriteColumns: async (_existing: unknown, input: { plan: FloorPlan; scene: DesignScene; versions?: unknown[] }) => ({ ok: true, set: { plan: input.plan, scene: input.scene, ...(input.versions ? { versions: input.versions } : {}) }, cost: {} }),
}));

// The account's plan: Premium unless a test makes it Free (no catalogue, no moving furniture).
const plan = vi.hoisted(() => ({ free: false }));
vi.mock('@/lib/plans/server', () => ({ featureAccess: async () => ({ plan: plan.free ? 'free' : 'premium', has: () => !plan.free, needs: () => 'premium' }) }));

const claude = vi.hoisted(() => ({ design: null as null | (() => Promise<unknown>), review: null as null | (() => Promise<unknown>), designCalls: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/design/aiDesign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/design/aiDesign')>()),
  designWithClaude: async (request: Record<string, unknown>) => {
    claude.designCalls.push(request);
    return claude.design!();
  },
}));
vi.mock('@/lib/design/aiReview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/design/aiReview')>()),
  reviewWithClaude: async () => claude.review!(),
}));

const { generationStatus, runDesignStage, settleStaleJob, startDesignJob } = await import('@/lib/api/designJob');
const reviewRoute = await import('@/app/api/design/ai-review/route');

const usage = { inputTokens: 1, outputTokens: 1, durationMs: 1, model: 'claude-test', costUsd: 0, seed: 1 };
const proposalAnswer = (proposal: AiProposal = generationProposal()) => async () => ({ proposal, usage });

/** How the server's request for the check is answered: the real route (the second invocation), a failure, or nothing at all (the function died). */
const trigger = vi.hoisted(() => ({ mode: 'route' as 'route' | 'fail' | 'lost', calls: [] as Array<{ url: string; headers: Record<string, string>; project: unknown }> }));
vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  trigger.calls.push({ url, headers, project: clone(rows.project) });
  if (trigger.mode === 'fail') return new Response('{}', { status: 500 });
  if (trigger.mode === 'lost') return new Response('{}', { status: 202 });
  return reviewRoute.POST(new Request(url, init) as never, { params: Promise.resolve({}) } as never);
});

const project = () => rows.project as unknown as Project & { scene: DesignScene; plan: FloorPlan };
const job = (id = 1) => rows.jobs.find((j) => j.id === id) as unknown as JobRow;
const account = { id: 5, role: 'user' as const };
const start = (baseRev = 3) => startDesignJob(account, { projectId: 42, baseRev, locale: 'en' });
/** The check runs after its route's answer: waited for until the job has ended. */
const settled = () => vi.waitFor(() => expect(['done', 'failed']).toContain(job().stage), { timeout: 2000 });

beforeEach(() => {
  rows.jobs.length = 0;
  rows.nextId = 1;
  rows.project = {
    id: 42,
    userId: 5,
    designRev: 3,
    designSaveId: 'browser-save',
    homeState: null,
    floorPlanUrl: null,
    selectedProducts: null,
    selectedFurniture: null,
    plan: generationPlan(),
    scene: { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [], finishes: [], electrical: [], decor: [], generation: null, progress: { step: 4, generated: false, at: 4, modeChosen: true } },
    versions: [{ id: 'v-old' }],
  };
  plan.free = false;
  claude.design = proposalAnswer();
  claude.review = async () => ({ review: { model: 'claude-test', fixes: [], notes: { bed: 'Checked.' } } satisfies AiReview, usage });
  claude.designCalls.length = 0;
  trigger.mode = 'route';
  trigger.calls.length = 0;
});

describe('a generation job', () => {
  it('designs, writes the flat not yet laid out, then checks it in a second invocation and writes it laid out', async () => {
    const started = await start();
    expect(started).toMatchObject({ ok: true, started: true, job: { stage: 'designing', aiCount: 1, baseRev: 3, locale: 'en' } });
    claude.review = async () => {
      const nightstand = project().scene.items.find((i) => i.kind === 'nightstand')!;
      return { review: { model: 'claude-test', fixes: [{ target: nightstand.id, action: 'remove', productId: null, wallIndex: null, reason: 'Too close.' }], notes: { bed: 'Checked.' } }, usage };
    };
    await runDesignStage(1, 'https://app.test');
    expect(claude.designCalls[0]).toMatchObject({ locale: 'en', styleId: 'modern', seed: job().seed });

    // The design stage's write, as the check's request found it: furnished, its own revision, not laid out yet.
    expect(trigger.calls).toHaveLength(1);
    const call = trigger.calls[0];
    expect(call.url).toBe('https://app.test/api/design/ai-review');
    expect(call.headers['x-design-job']).toBe('1');
    const designed = call.project as ReturnType<typeof project>;
    expect(designed).toMatchObject({ designRev: 4, designSaveId: 'job-1-design', versions: [] });
    expect(designed.scene.progress).toMatchObject({ generated: false, step: 4 });
    expect(designed.scene.generation).toMatchObject({ by: 'ai', aiCount: 1 });
    expect(designed.scene.items.find((i) => i.kind === 'bed_double')?.product?.productId).toBe(102);

    await settled();
    expect(job()).toMatchObject({ stage: 'done', error: null });
    expect(job().review).toMatchObject({ fixes: [{ action: 'remove' }] });
    expect(project()).toMatchObject({ designRev: 5, designSaveId: 'job-1-review' });
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5, at: 5 });
    expect(project().scene.generation).toMatchObject({ by: 'ai', reviewed: 1, notes: { bed: 'A calm bedroom. Checked.' } });
    expect(project().scene.items.filter((i) => i.kind === 'nightstand')).toHaveLength(designed.scene.items.filter((i) => i.kind === 'nightstand').length - 1);
  });

  it('lays the flat out with the engine, in one write, when the designer fails', async () => {
    claude.design = async () => {
      throw new Error('The designer declined');
    };
    await start();
    await runDesignStage(1, 'https://app.test');
    expect(trigger.calls).toHaveLength(0);
    expect(job()).toMatchObject({ stage: 'done' });
    expect(job().error).toContain('The designer declined');
    expect(project().designRev).toBe(4);
    expect(project().scene.generation).toMatchObject({ by: 'engine', aiCount: 1 });
    expect(project().scene.decor).toEqual([]);
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5 });
    expect(project().scene.items.length).toBeGreaterThan(0);
  });

  it('opens the flat as laid out when the check fails or cannot be started', async () => {
    claude.review = async () => {
      throw new Error('overloaded');
    };
    await start();
    await runDesignStage(1, 'https://app.test');
    await settled();
    expect(job()).toMatchObject({ stage: 'done', review: null });
    expect(job().error).toContain('overloaded');
    expect(project().scene.progress).toMatchObject({ generated: true });
    expect(project().scene.generation?.reviewed).toBeUndefined();

    rows.project = { ...rows.project, scene: { ...project().scene, progress: { step: 4, generated: false, at: 4 } } };
    trigger.mode = 'fail';
    const second = await start(project().designRev);
    expect(second).toMatchObject({ ok: true, started: true });
    await runDesignStage(2, 'https://app.test');
    expect(job(2)).toMatchObject({ stage: 'done', error: 'REVIEW_NOT_STARTED' });
    expect(project().scene.progress).toMatchObject({ generated: true });
  });

  it('never writes over a design changed under it', async () => {
    await start();
    rows.project = { ...rows.project, designRev: 4 };
    await runDesignStage(1, 'https://app.test');
    expect(job()).toMatchObject({ stage: 'failed', error: 'PROJECT_CHANGED' });
    expect(project().scene.items).toEqual([]);

    // …nor the check over one changed while it ran.
    rows.project = { ...rows.project, designRev: 3 };
    rows.jobs.length = 0;
    trigger.mode = 'lost';
    await start();
    await runDesignStage(rows.jobs[0].id as number, 'https://app.test');
    rows.project = { ...rows.project, designRev: project().designRev + 1 };
    trigger.mode = 'route';
    await reviewRoute.POST(new Request('https://app.test/api/design/ai-review', { method: 'POST', headers: trigger.calls[0].headers }) as never, { params: Promise.resolve({}) } as never);
    await vi.waitFor(() => expect(rows.jobs[0].stage).toBe('done'));
    expect(rows.jobs[0].error).toBe('PROJECT_CHANGED');
    expect(project().scene.progress?.generated).toBe(false);
  });

  it('is started once at a time, from the revision just saved, within the cap', async () => {
    const first = await start();
    const again = await start();
    expect(again).toMatchObject({ ok: true, started: false, job: { id: (first as { job: JobRow }).job.id } });
    expect(rows.jobs).toHaveLength(1);

    rows.jobs[0].stage = 'done';
    expect(await start(2)).toMatchObject({ ok: false, error: 'PROJECT_CHANGED', status: 409 });
    for (let i = 0; i < 4; i++) rows.jobs.push({ ...rows.jobs[0], id: rows.nextId++ });
    expect(await start()).toMatchObject({ ok: false, error: 'AI_LIMIT', status: 429 });
    rows.jobs.length = 0;
    rows.project = { ...rows.project, scene: { ...project().scene, generation: { by: 'ai', at: 'x', aiCount: 5 } } };
    expect(await start()).toMatchObject({ ok: false, error: 'AI_LIMIT' });
  });

  it('is refused the account’s plan does not lay a laid-out flat out again, and passes the locks on a Free account otherwise', async () => {
    plan.free = true;
    await start();
    await runDesignStage(1, 'https://app.test');
    await settled();
    expect(job()).toMatchObject({ stage: 'done', error: null });
    expect(project().scene.progress).toMatchObject({ generated: true });

    expect(await start(project().designRev)).toMatchObject({ ok: false, error: 'PLAN_REQUIRED', status: 402, feature: 'catalog' });
  });

  it('refuses a check the server did not sign', async () => {
    await start();
    const forged = await reviewRoute.POST(new Request('https://app.test/api/design/ai-review', { method: 'POST', headers: { 'x-design-job': '1', 'x-design-job-token': 'nope' } }) as never, { params: Promise.resolve({}) } as never);
    expect(forged.status).toBe(403);
    expect(job().stage).toBe('designing');
  });
});

describe('a job whose function died', () => {
  const longAgo = () => new Date(Date.now() - JOB_STALE_MS - 60_000);

  it('designing: settled as failed when read, and the page lays the flat out with the engine', async () => {
    await start();
    job().stageAt = longAgo();
    const status = await generationStatus(42, 5);
    expect(status).toMatchObject({ designGenerated: false, job: { stage: 'failed', error: 'TIMEOUT' } });
    expect(generationAction(status!, { generated: false, generatedAt: null }, false)).toBe('engine');
    expect(generationAction(status!, { generated: false, generatedAt: null }, true)).toBe('engine');
    // A start after it is a new job.
    expect(await start()).toMatchObject({ ok: true, started: true, job: { id: 2 } });
  });

  it('checking: the flat it wrote is opened as laid out, once, and the page reads it again', async () => {
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    expect(job().stage).toBe('checking');
    expect(generationAction((await generationStatus(42, 5))!, { generated: false, generatedAt: null }, false)).toBe('wait');

    job().stageAt = longAgo();
    const status = await generationStatus(42, 5);
    expect(status).toMatchObject({ designGenerated: true, job: { stage: 'done', error: 'REVIEW_TIMEOUT' } });
    expect(project()).toMatchObject({ designRev: 5 });
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5 });
    expect(generationAction(status!, { generated: false, generatedAt: null }, false)).toBe('reload');
    await settleStaleJob(42);
    expect(project().designRev).toBe(5);
  });

  it('answers no project that is not the account’s', async () => {
    expect(await generationStatus(42, 6)).toBeNull();
  });
});
