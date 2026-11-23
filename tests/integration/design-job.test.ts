import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignJob, Project } from '@/lib/db/schema';
import { MAX_AI_GENERATIONS, type AiProposal } from '@/lib/design/aiProposal';
import { RATE_RULES } from '@/lib/api/rateLimit';
import type { AiReview } from '@/lib/design/aiReview';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { generationAction, JOB_STALE_MS, startRefusal } from '@/lib/design/generationJob';
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
/** `beforeWrite`: run once at the start of the next job write, as another writer landing just before it. */
const rows = vi.hoisted(() => ({ project: null as unknown as Record<string, unknown>, jobs: [] as Array<Record<string, unknown>>, nextId: 1, beforeWrite: null as null | (() => void) }));
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
        jobs: jobsOf(projectId).map((j) => ({ stage: j.stage, error: j.error, createdAt: j.createdAt, hasProposal: j.proposal != null })),
        insert: async (job: Partial<JobRow>) => {
          const now = new Date();
          const row = { id: rows.nextId++, stage: 'designing', proposal: null, review: null, error: null, createdAt: now, stageAt: now, finishedAt: null, ...job };
          rows.jobs.push(row);
          return clone(row);
        },
      }),
    updateJob: async (id: number, update: Partial<JobRow>, fromStage?: string) => {
      const row = find(id)!;
      if (!fromStage || row.stage === fromStage) Object.assign(row, update);
    },
    jobAndRevision: async (id: number, projectId: number) => ({ stage: find(id)?.stage ?? null, designRev: project().id === projectId ? project().designRev : null }),
    claimJob: async (job: Pick<JobRow, 'id' | 'stage' | 'stageAt'>, update: Partial<JobRow>) => {
      const row = find(job.id)!;
      if (row.stage !== job.stage || row.stageAt.getTime() !== new Date(job.stageAt).getTime()) return false;
      Object.assign(row, update);
      return true;
    },
    writeDesignForJob: async (projectId: number, expectRev: number, set: Record<string, unknown>, saveId: string, jobId: number, jobUpdate: Partial<JobRow>) => {
      const landing = rows.beforeWrite;
      rows.beforeWrite = null;
      landing?.();
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

const claude = vi.hoisted(() => ({ design: null as null | (() => Promise<unknown>), review: null as null | (() => Promise<unknown>), designCalls: [] as Array<Record<string, unknown>>, reviewCalls: 0 }));
vi.mock('@/lib/design/aiDesign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/design/aiDesign')>()),
  designWithClaude: async (request: Record<string, unknown>) => {
    claude.designCalls.push(request);
    return claude.design!();
  },
}));
vi.mock('@/lib/design/aiReview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/design/aiReview')>()),
  reviewWithClaude: async () => {
    claude.reviewCalls += 1;
    return claude.review!();
  },
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
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60_000);
const start = (baseRev = 3) => startDesignJob(account, { projectId: 42, baseRev, locale: 'en' });
/** The check runs after its route's answer: waited for until the job has ended. */
const settled = () => vi.waitFor(() => expect(['done', 'failed']).toContain(job().stage), { timeout: 2000 });

beforeEach(() => {
  rows.jobs.length = 0;
  rows.nextId = 1;
  rows.beforeWrite = null;
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
  claude.reviewCalls = 0;
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
    // What the job knew, kept on its row: the proposal and the check, each with what it cost, and how many fixes went in.
    expect(job().proposal).toMatchObject({ rooms: expect.any(Array), usage: { model: 'claude-test', costUsd: 0 } });
    expect(job().review).toMatchObject({ usage: { model: 'claude-test' }, applied: 1 });
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
    expect(job().error).toMatch(/^design:AI_FAILED .*The designer declined/);
    expect(project().designRev).toBe(4);
    // The engine's flat is not an AI run (`wroteDesignersFlat`).
    expect(project().scene.generation).toMatchObject({ by: 'engine', aiCount: 0 });
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
    expect(job().error).toMatch(/^check:AI_FAILED .*overloaded/);
    expect(project().scene.progress).toMatchObject({ generated: true });
    expect(project().scene.generation?.reviewed).toBeUndefined();

    rows.project = { ...rows.project, scene: { ...project().scene, progress: { step: 4, generated: false, at: 4 } } };
    trigger.mode = 'fail';
    const second = await start(project().designRev);
    expect(second).toMatchObject({ ok: true, started: true });
    await runDesignStage(2, 'https://app.test');
    expect(job(2)).toMatchObject({ stage: 'done', error: 'check:NOT_STARTED' });
    expect(project().scene.progress).toMatchObject({ generated: true });
  });

  it('does not ask the designer when the design changed after the start, and never writes over one changed while it worked', async () => {
    await start();
    rows.project = { ...rows.project, designRev: 4 };
    await runDesignStage(1, 'https://app.test');
    // Read again right before the paid call: given up, nothing paid, nothing written.
    expect(claude.designCalls).toHaveLength(0);
    expect(job()).toMatchObject({ stage: 'failed', error: 'design:CHANGED' });
    expect(project().scene.items).toEqual([]);

    // Changed while the designer worked (a change the save route cannot refuse): its write is refused.
    rows.project = { ...rows.project, designRev: 3 };
    rows.jobs.length = 0;
    claude.design = async () => {
      rows.project = { ...rows.project, designRev: 4 };
      return { proposal: generationProposal(), usage };
    };
    await start();
    await runDesignStage(rows.jobs[0].id as number, 'https://app.test');
    expect(claude.designCalls).toHaveLength(1);
    expect(rows.jobs[0]).toMatchObject({ stage: 'failed', error: 'design:PROJECT_CHANGED' });
    // The paid proposal is kept on the job, with its cost — it is not an AI run (`wroteDesignersFlat`).
    expect(rows.jobs[0].proposal).toMatchObject({ rooms: expect.any(Array), usage: { model: 'claude-test' } });
    expect(project().scene.items).toEqual([]);
  });

  it('does not ask for the check when the design changed after the design stage wrote it', async () => {
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    expect(job().stage).toBe('checking');
    rows.project = { ...rows.project, designRev: project().designRev + 1 };
    trigger.mode = 'route';
    await reviewRoute.POST(new Request('https://app.test/api/design/ai-review', { method: 'POST', headers: trigger.calls[0].headers }) as never, { params: Promise.resolve({}) } as never);
    await settled();
    expect(claude.reviewCalls).toBe(0);
    expect(job()).toMatchObject({ stage: 'done', review: null });
    expect(job().error).toMatch(/^check:CHANGED/);
  });

  /** A check started by the server's request, as the check's own invocation runs it, waited for. */
  const runCheck = async () => {
    await reviewRoute.POST(new Request('https://app.test/api/design/ai-review', { method: 'POST', headers: trigger.calls.at(-1)!.headers }) as never, { params: Promise.resolve({}) } as never);
    await settled();
  };

  it('leaves the designer’s flat laid out, unchecked, whatever ends the check — never a furnished flat stuck before the studio', async () => {
    // A change the save route cannot see (the calculation's save turning the design's mode), before the check…
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    const designed = clone(project().scene);
    rows.project = { ...rows.project, designRev: project().designRev + 1, scene: { ...project().scene, mode: 'full' } };
    await runCheck();
    expect(claude.reviewCalls).toBe(0);
    expect(job()).toMatchObject({ stage: 'done', error: 'check:CHANGED' });
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5, at: 5 });
    // …the designer's flat as written, with the change kept.
    expect(project().scene.items).toEqual(designed.items);
    expect(project().scene.mode).toBe('full');
    expect(await generationStatus(42, { id: 5, role: 'user' })).toMatchObject({ designGenerated: true });

    // …while the check runs: paid, but its fixes are not applied over a design that moved on.
    rows.jobs.length = 0;
    rows.nextId = 1;
    rows.project = { ...rows.project, scene: { ...project().scene, progress: { step: 4, generated: false } } };
    await start(project().designRev);
    await runDesignStage(1, 'https://app.test');
    const written = clone(project().scene);
    claude.review = async () => {
      rows.project = { ...rows.project, designRev: project().designRev + 1 };
      const nightstand = project().scene.items.find((i) => i.kind === 'nightstand')!;
      return { review: { model: 'claude-test', fixes: [{ target: nightstand.id, action: 'remove', productId: null, wallIndex: null, reason: 'x' }], notes: {} }, usage };
    };
    await runCheck();
    expect(job()).toMatchObject({ stage: 'done', error: 'check:PROJECT_CHANGED' });
    expect(job().review).toMatchObject({ fixes: [{ action: 'remove' }] });
    expect(project().scene.items).toEqual(written.items);
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5 });

    // …and when the check's own step throws.
    rows.jobs.length = 0;
    rows.nextId = 1;
    rows.project = { ...rows.project, scene: { ...project().scene, progress: { step: 4, generated: false } } };
    await start(project().designRev);
    await runDesignStage(1, 'https://app.test');
    // An answer the fixes cannot be applied from (no list of them): applying it throws.
    claude.review = async () => ({ review: { model: 'claude-test', fixes: { length: 1 }, notes: {} }, usage });
    await runCheck();
    expect(job().stage).toBe('done');
    expect(job().error).toMatch(/^check:ERROR /);
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5 });
  });

  it('lays the designer’s flat out, unchecked, over a change that lands between the check’s read and its write', async () => {
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    const designed = clone(project().scene);
    claude.review = async () => {
      const nightstand = project().scene.items.find((i) => i.kind === 'nightstand')!;
      return { review: { model: 'claude-test', fixes: [{ target: nightstand.id, action: 'remove', productId: null, wallIndex: null, reason: 'x' }], notes: {} }, usage };
    };
    // The calculation's save turning the design's mode lands after the check read the design, before its write.
    rows.beforeWrite = () => {
      rows.project = { ...rows.project, designRev: project().designRev + 1, scene: { ...project().scene, mode: 'full' } };
    };
    await runCheck();
    expect(job()).toMatchObject({ stage: 'done', error: 'check:PROJECT_CHANGED' });
    expect(job().review).toMatchObject({ applied: 0 });
    // The designer's flat as written (the fixes not applied over the change), the change kept, laid out.
    expect(project().scene.items).toEqual(designed.items);
    expect(project().scene.mode).toBe('full');
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5, at: 5 });
    expect(await generationStatus(42, { id: 5, role: 'user' })).toMatchObject({ designGenerated: true });
  });

  it('leaves another design than its own as it is', async () => {
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    // The job taken for dead and the person's own copy kept over it (forced), not laid out.
    const theirs = { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [], finishes: [], electrical: [], decor: [], generation: null, progress: { step: 4, generated: false } };
    rows.project = { ...rows.project, designRev: project().designRev + 1, scene: theirs };
    await runCheck();
    expect(job()).toMatchObject({ stage: 'done', error: 'check:CHANGED' });
    expect(project().scene).toEqual(theirs);

    // …also when their copy lands between the check's read and its write.
    rows.jobs.length = 0;
    rows.nextId = 1;
    rows.project = { ...rows.project, scene: { ...theirs, progress: { step: 4, generated: false } } };
    await start(project().designRev);
    await runDesignStage(1, 'https://app.test');
    rows.beforeWrite = () => {
      rows.project = { ...rows.project, designRev: project().designRev + 1, scene: theirs };
    };
    await runCheck();
    expect(job()).toMatchObject({ stage: 'done', error: 'check:PROJECT_CHANGED' });
    expect(project().scene).toEqual(theirs);
  });

  it('is started once at a time, from the revision just saved, within the cap', async () => {
    const first = await start();
    const again = await start();
    expect(again).toMatchObject({ ok: true, started: false, job: { id: (first as { job: JobRow }).job.id } });
    expect(rows.jobs).toHaveLength(1);

    // Five runs that wrote the designer's flat (long ago, so the safety stop does not count them).
    Object.assign(rows.jobs[0], { stage: 'done', proposal: generationProposal(), createdAt: hoursAgo(3) });
    expect(await start(2)).toMatchObject({ ok: false, error: 'PROJECT_CHANGED', status: 409 });
    for (let i = 0; i < 4; i++) rows.jobs.push({ ...rows.jobs[0], id: rows.nextId++ });
    expect(await start()).toMatchObject({ ok: false, error: 'AI_LIMIT', status: 429 });
    rows.jobs.length = 0;
    rows.project = { ...rows.project, scene: { ...project().scene, generation: { by: 'ai', at: 'x', aiCount: 5 } } };
    expect(await start()).toMatchObject({ ok: false, error: 'AI_LIMIT' });
  });

  it('counts towards the cap only the runs that wrote the designer’s flat', async () => {
    const run = async () => {
      const started = await start(project().designRev);
      expect(started).toMatchObject({ ok: true, started: true });
      await runDesignStage((started as { job: JobRow }).job.id, 'https://app.test');
      // Long ago: the safety stop is its own test.
      rows.jobs.at(-1)!.createdAt = hoursAgo(3);
    };
    // A designer that fails (the engine's flat), a write refused, a design changed before the call,
    // a function that died: none of them is an AI run, however many there are.
    claude.design = async () => {
      throw new Error('529 overloaded');
    };
    for (let i = 0; i < 3; i++) {
      await run();
      expect(rows.jobs.at(-1)).toMatchObject({ stage: 'done', proposal: null });
      expect(project().scene.generation).toMatchObject({ by: 'engine', aiCount: 0 });
      rows.project = { ...rows.project, scene: { ...project().scene, progress: { step: 4, generated: false } } };
    }
    claude.design = async () => {
      rows.project = { ...rows.project, designRev: Number(rows.project.designRev) + 1 };
      return { proposal: generationProposal(), usage };
    };
    for (let i = 0; i < 3; i++) {
      await run();
      expect(rows.jobs.at(-1)).toMatchObject({ stage: 'failed', error: 'design:PROJECT_CHANGED' });
    }
    for (let i = 0; i < 3; i++) {
      await start(project().designRev);
      Object.assign(rows.jobs.at(-1)!, { stage: 'failed', error: 'design:TIMEOUT', createdAt: hoursAgo(3) });
    }
    expect(rows.jobs).toHaveLength(9);

    // …and the runs that wrote one count: five, then the cap.
    claude.design = proposalAnswer();
    trigger.mode = 'lost';
    for (let i = 0; i < MAX_AI_GENERATIONS; i++) {
      await run();
      expect(rows.jobs.at(-1)).toMatchObject({ stage: 'checking' });
      expect(project().scene.generation).toMatchObject({ by: 'ai', aiCount: i + 1 });
      rows.jobs.at(-1)!.stage = 'done';
    }
    expect(await start(project().designRev)).toMatchObject({ ok: false, error: 'AI_LIMIT', status: 429 });
  });

  it('stops asking the designer for one design after as many calls in an hour as the start’s rate rule allows', async () => {
    const recent = (patch: Partial<JobRow>) => rows.jobs.push({ id: rows.nextId++, projectId: 42, stage: 'failed', proposal: null, review: null, error: 'design:AI_FAILED Error: 529 overloaded', createdAt: new Date(), stageAt: new Date(), finishedAt: new Date(), ...patch });
    for (let i = 0; i < RATE_RULES.aiGenerate.limit - 1; i++) recent({ stage: 'done' });
    // Ended before the designer was asked: not a call.
    recent({ error: 'design:CHANGED' });
    recent({ error: 'design:NO_DESIGN' });
    // A call an hour and more ago is out of the window.
    recent({ createdAt: hoursAgo(2) });
    expect(await start()).toMatchObject({ ok: true, started: true });
    rows.jobs.at(-1)!.stage = 'failed';
    expect(await start()).toMatchObject({ ok: false, error: 'AI_PAUSED', status: 429 });
  });

  it('is refused the account’s plan does not lay a laid-out flat out again, and passes the locks on a Free account otherwise', async () => {
    plan.free = true;
    // Before the layout every plan may generate: nothing to tell the page.
    expect(await generationStatus(42, { id: 5, role: 'user' })).toMatchObject({ planRefused: null });
    await start();
    await runDesignStage(1, 'https://app.test');
    await settled();
    expect(job()).toMatchObject({ stage: 'done', error: null });
    expect(project().scene.progress).toMatchObject({ generated: true });

    expect(await start(project().designRev)).toMatchObject({ ok: false, error: 'PLAN_REQUIRED', status: 402, feature: 'catalog' });
    // The page is told before a press (decision 10a), and a refused start is the plan's, not a failure.
    expect(await generationStatus(42, { id: 5, role: 'user' })).toMatchObject({ planRefused: { feature: 'catalog', plan: 'premium' } });
    expect(startRefusal(402, 'PLAN_REQUIRED')).toBe('plan');
    plan.free = false;
    expect(await generationStatus(42, { id: 5, role: 'user' })).toMatchObject({ planRefused: null });
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

  it('designing: settled as failed when read; the page waiting on it lays the flat out with the engine, a later visit waits for a press', async () => {
    await start();
    job().stageAt = longAgo();
    const status = await generationStatus(42, { id: 5, role: 'user' });
    expect(status).toMatchObject({ designGenerated: false, job: { stage: 'failed', error: 'design:TIMEOUT' } });
    expect(generationAction(status!, { generated: false }, true)).toBe('engine');
    expect(generationAction(status!, { generated: false }, false)).toBe('none');
    // A start after it is a new job.
    expect(await start()).toMatchObject({ ok: true, started: true, job: { id: 2 } });
  });

  it('is settled by nobody but the project’s own account', async () => {
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    job().stageAt = longAgo();
    expect(await startDesignJob({ id: 6, role: 'user' }, { projectId: 42, baseRev: project().designRev, locale: 'en' })).toMatchObject({ ok: false, error: 'PROJECT_NOT_FOUND', status: 404 });
    // Untouched: still the dead check, the flat not laid out.
    expect(job().stage).toBe('checking');
    expect(project().scene.progress?.generated).toBe(false);
    // The owner's start settles it first (the flat opens laid out), then finds the design moved on.
    expect(await start(4)).toMatchObject({ ok: false, error: 'PROJECT_CHANGED' });
    expect(job()).toMatchObject({ stage: 'done', error: 'check:TIMEOUT' });
  });

  it('checking: the flat it wrote is opened as laid out, once, and the page reads it again', async () => {
    trigger.mode = 'lost';
    await start();
    await runDesignStage(1, 'https://app.test');
    expect(job().stage).toBe('checking');
    expect(generationAction((await generationStatus(42, { id: 5, role: 'user' }))!, { generated: false }, false)).toBe('wait');

    job().stageAt = longAgo();
    const status = await generationStatus(42, { id: 5, role: 'user' });
    expect(status).toMatchObject({ designGenerated: true, job: { stage: 'done', error: 'check:TIMEOUT' } });
    expect(project()).toMatchObject({ designRev: 5 });
    expect(project().scene.progress).toMatchObject({ generated: true, step: 5 });
    expect(generationAction(status!, { generated: false }, false)).toBe('reload');
    await settleStaleJob(42);
    expect(project().designRev).toBe(5);
  });

  it('answers no project that is not the account’s', async () => {
    expect(await generationStatus(42, { id: 6, role: 'user' })).toBeNull();
  });
});
