/* eslint-disable no-console */
/**
 * Deletes floor-plan uploads that no saved project refers to.
 *
 *   pnpm uploads:cleanup            delete orphans older than 24 hours
 *   pnpm uploads:cleanup --dry-run  list what would go
 *   MAX_AGE_HOURS=72 pnpm uploads:cleanup
 *
 * Every visitor who tries the studio uploads a plan, and most never save. The grace period
 * keeps a plan that is still being edited in a browser tab; after that, a plan is kept only
 * if a project's `floorPlanUrl` or `plan.imageUrl` points at it. Works with either storage
 * driver. Run it nightly from cron on the VPS.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const { storage } = await import('../lib/storage');
  const { db, pool } = await import('../lib/db');
  const { projects } = await import('../lib/db/schema');

  const dryRun = process.argv.includes('--dry-run');
  const maxAgeMs = Number(process.env.MAX_AGE_HOURS ?? 24) * 60 * 60_000;
  const cutoff = Date.now() - maxAgeMs;

  const rows = await db.select({ floorPlanUrl: projects.floorPlanUrl, plan: projects.plan }).from(projects);
  const referenced = new Set<string>();
  for (const row of rows) {
    const urls = [row.floorPlanUrl, (row.plan as { imageUrl?: string | null } | null)?.imageUrl];
    for (const url of urls) {
      if (!url) continue;
      const key = storage.keyFor(url);
      if (key) referenced.add(key);
    }
  }

  const objects = await storage.list('plans');
  let removed = 0;
  let kept = 0;
  for (const object of objects) {
    const orphan = !referenced.has(object.key) && object.lastModified.getTime() < cutoff;
    if (!orphan) {
      kept++;
      continue;
    }
    removed++;
    console.log(`${dryRun ? 'would delete' : 'deleting'} ${object.key} (${Math.round(object.size / 1024)} KB, ${object.lastModified.toISOString()})`);
    if (!dryRun) await storage.delete(object.key);
  }

  console.log(`\n${objects.length} plan files: ${kept} kept, ${removed} ${dryRun ? 'orphaned' : 'deleted'} (${referenced.size} referenced by projects)`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ cleanup failed:', err);
  process.exit(1);
});
