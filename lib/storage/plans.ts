import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storage, type StoredObject } from './index';

/**
 * Floor-plan uploads no project refers to (`pnpm uploads:cleanup`, and the daily
 * `/api/cron/cleanup`). Every visitor who tries the studio uploads a plan, and most never save.
 * The grace period keeps a plan that is still being edited in a browser tab; after that, a plan
 * is kept only if a project points at it — its `floorPlanUrl`, its design's `plan.imageUrl`, the
 * calculator board's image and plan, or a kept version's plan. The references are read with
 * JSON operators, so the scenes and versions themselves never leave the database.
 */
export async function referencedPlanKeys(): Promise<Set<string>> {
  const result = await db.execute<{ url: string | null }>(sql`
    SELECT floor_plan_url AS url FROM projects WHERE floor_plan_url IS NOT NULL
    UNION SELECT plan ->> 'imageUrl' FROM projects WHERE plan ? 'imageUrl'
    UNION SELECT calculator_board ->> 'floorPlanUrl' FROM projects WHERE calculator_board ? 'floorPlanUrl'
    UNION SELECT calculator_board -> 'plan' ->> 'imageUrl' FROM projects WHERE calculator_board -> 'plan' ? 'imageUrl'
    UNION SELECT jsonb_path_query(versions, '$[*].plan.imageUrl') #>> '{}' FROM projects WHERE jsonb_typeof(versions) = 'array'
  `);
  const keys = new Set<string>();
  for (const row of result.rows) {
    if (!row.url) continue;
    const key = storage.keyFor(row.url);
    if (key) keys.add(key);
  }
  return keys;
}

/** The plan files older than `cutoff` that nothing refers to. */
export async function orphanPlans(cutoff: Date): Promise<{ orphans: StoredObject[]; total: number; referenced: number }> {
  const referenced = await referencedPlanKeys();
  const objects = await storage.list('plans');
  const orphans = objects.filter((o) => !referenced.has(o.key) && o.lastModified < cutoff);
  return { orphans, total: objects.length, referenced: referenced.size };
}

export async function removeOrphanPlans(cutoff: Date): Promise<number> {
  const { orphans } = await orphanPlans(cutoff);
  for (const object of orphans) await storage.delete(object.key);
  return orphans.length;
}
