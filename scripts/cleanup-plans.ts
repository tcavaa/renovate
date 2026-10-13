/* eslint-disable no-console */
/**
 * Deletes floor-plan uploads that no saved project refers to (`lib/storage/plans.ts`).
 *
 *   pnpm uploads:cleanup            delete orphans older than 24 hours
 *   pnpm uploads:cleanup --dry-run  list what would go
 *   MAX_AGE_HOURS=72 pnpm uploads:cleanup
 *
 * Production runs the same sweep every day by itself (`/api/cron/cleanup`, Vercel Cron); this is
 * for a local disk, or for a different age than the cron's.
 */
import './lib/loadEnv';

async function main() {
  const { storage } = await import('../lib/storage');
  const { orphanPlans } = await import('../lib/storage/plans');
  const { pool } = await import('../lib/db');

  const dryRun = process.argv.includes('--dry-run');
  const cutoff = new Date(Date.now() - Number(process.env.MAX_AGE_HOURS ?? 24) * 60 * 60_000);
  const { orphans, total, referenced } = await orphanPlans(cutoff);
  for (const object of orphans) {
    console.log(`${dryRun ? 'would delete' : 'deleting'} ${object.key} (${Math.round(object.size / 1024)} KB, ${object.lastModified.toISOString()})`);
    if (!dryRun) await storage.delete(object.key);
  }
  console.log(`\n${total} plan files: ${total - orphans.length} kept, ${orphans.length} ${dryRun ? 'orphaned' : 'deleted'} (${referenced} referenced by projects)`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ cleanup failed:', err);
  process.exit(1);
});
