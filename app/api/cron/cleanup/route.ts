import { env } from '@/lib/env';
import { sweepCounters } from '@/lib/api/counterStore';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { log } from '@/lib/log';
import { removeOrphanPlans } from '@/lib/storage/plans';
import { sweepUploads } from '@/lib/uploads/claim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DAY = 24 * 60 * 60_000;

/**
 * The daily tidy-up, called by Vercel Cron (`vercel.json`, 03:00 UTC) with
 * `Authorization: Bearer <CRON_SECRET>`; anyone else gets a 401, and without `CRON_SECRET` set
 * so does everyone. Each part is idempotent, so a missed or repeated run is harmless:
 *
 *  - direct uploads granted more than a day ago (their rows) and staged files never claimed;
 *  - rate-limit and lockout counters whose window and lock ended two days ago;
 *  - floor plans older than a day that no project refers to (what `pnpm uploads:cleanup` does).
 */
export const GET = handle('GET /api/cron/cleanup', 'Cleanup failed', async (req) => {
  if (!env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const now = Date.now();
  const uploads = await sweepUploads(new Date(now - DAY));
  const counters = await sweepCounters(new Date(now - 2 * DAY));
  const plans = await removeOrphanPlans(new Date(now - DAY));
  const summary = { uploadRows: uploads.rows, stagedFiles: uploads.files, counters, plans };
  log.info('daily cleanup', summary);
  return ok(summary);
});
