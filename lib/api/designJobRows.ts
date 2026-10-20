import { and, count, eq, sql } from 'drizzle-orm';
import { desc } from '@/lib/db/order';
import { db } from '@/lib/db';
import { designJobs, projects, users, type DesignJob, type Project } from '@/lib/db/schema';
import type { UserRole } from '@/lib/auth/roles';

/**
 * The rows a generation job reads and writes (`lib/api/designJob`), and nothing else: each query
 * on its own here, the job's rules there — so the rules are tested against these in memory
 * (`tests/integration/design-job.test.ts`).
 */

export type JobUpdate = Partial<Pick<DesignJob, 'stage' | 'proposal' | 'review' | 'error' | 'stageAt' | 'finishedAt'>>;
export type NewJob = Pick<DesignJob, 'projectId' | 'userId' | 'locale' | 'baseRev' | 'seed' | 'aiCount'>;

export async function loadJob(jobId: number): Promise<DesignJob | null> {
  const [job] = await db.select().from(designJobs).where(eq(designJobs.id, jobId)).limit(1);
  return job ?? null;
}

export async function latestJob(projectId: number): Promise<DesignJob | null> {
  const [job] = await db.select().from(designJobs).where(eq(designJobs.projectId, projectId)).orderBy(desc(designJobs.id)).limit(1);
  return job ?? null;
}

export async function loadProject(projectId: number): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return row ?? null;
}

/** The account's own project, whole — or null. */
export async function ownedProject(projectId: number, userId: number): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  return row ?? null;
}

/** Whether the project is the account's and its design laid out (`scene.progress.generated`), reading the row's small parts only. */
export async function projectGenerated(projectId: number, userId: number): Promise<{ generated: boolean } | null> {
  const [row] = await db
    .select({ generated: sql<boolean>`coalesce((${projects.scene} -> 'progress' ->> 'generated')::boolean, false)` })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return row ? { generated: row.generated === true } : null;
}

export async function userRole(userId: number): Promise<UserRole | null> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role ?? null;
}

/** What a start sees while it holds the project's lock. */
export interface LockedJobs {
  latest: DesignJob | null;
  designRev: number | null;
  /** Every job the project has had: each one an AI run. */
  jobCount: number;
  insert: (job: NewJob) => Promise<DesignJob>;
}

/** Runs `fn` holding the project's lock for the length of a transaction: two tabs starting at once start one job. */
export async function withJobLock<T>(projectId: number, fn: (locked: LockedJobs) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${7_302}, ${projectId})`);
    const [latest] = await tx.select().from(designJobs).where(eq(designJobs.projectId, projectId)).orderBy(desc(designJobs.id)).limit(1);
    const [row] = await tx.select({ designRev: projects.designRev }).from(projects).where(eq(projects.id, projectId)).limit(1);
    const [{ n }] = await tx.select({ n: count() }).from(designJobs).where(eq(designJobs.projectId, projectId));
    return fn({
      latest: latest ?? null,
      designRev: row?.designRev ?? null,
      jobCount: Number(n),
      insert: async (job) => (await tx.insert(designJobs).values(job).returning())[0],
    });
  });
}

export async function updateJob(jobId: number, update: JobUpdate): Promise<void> {
  await db.update(designJobs).set(update).where(eq(designJobs.id, jobId));
}

/** Moves a job on only if it is still where it was read (its stage and `stageAt`): two readers settle it once. */
export async function claimJob(job: Pick<DesignJob, 'id' | 'stage' | 'stageAt'>, update: JobUpdate): Promise<boolean> {
  const claimed = await db
    .update(designJobs)
    .set(update)
    .where(and(eq(designJobs.id, job.id), eq(designJobs.stage, job.stage), eq(designJobs.stageAt, job.stageAt)))
    .returning({ id: designJobs.id });
  return claimed.length > 0;
}

/**
 * The design written over revision `expectRev` and the job moved on, in one transaction: false,
 * and nothing written, when the design has moved on since.
 */
export async function writeDesignForJob(projectId: number, expectRev: number, set: Partial<typeof projects.$inferInsert>, saveId: string, jobId: number, jobUpdate: JobUpdate): Promise<boolean> {
  return db.transaction(async (tx) => {
    const written = await tx
      .update(projects)
      .set({ ...set, designRev: sql`${projects.designRev} + 1`, designSaveId: saveId })
      .where(and(eq(projects.id, projectId), eq(projects.designRev, expectRev)))
      .returning({ id: projects.id });
    if (written.length === 0) return false;
    await tx.update(designJobs).set(jobUpdate).where(eq(designJobs.id, jobId));
    return true;
  });
}
