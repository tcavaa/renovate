import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startedAt = Date.now();

/**
 * Liveness and readiness in one: 200 when the server is up and the database answers, 503 when
 * it does not. Unauthenticated and unthrottled on purpose — this is what an uptime monitor and
 * the deployment checks call. `version` is the commit Vercel built (`VERCEL_GIT_COMMIT_SHA`);
 * `uptimeSec` is the age of the instance that answered.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'fail'> = { db: 'fail' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db timeout')), 3000);
      }),
    ]);
    checks.db = 'ok';
  } catch (e) {
    log.error('health: database check failed', { err: e });
  } finally {
    clearTimeout(timer);
  }

  const healthy = Object.values(checks).every((c) => c === 'ok');
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev',
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
