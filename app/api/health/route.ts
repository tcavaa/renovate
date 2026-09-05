import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startedAt = Date.now();

/**
 * Liveness and readiness in one: 200 when the process is up and the database answers,
 * 503 when it does not. Unauthenticated and unthrottled on purpose — this is what the uptime
 * monitor, the deploy script and Nginx's upstream check call.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'fail'> = { db: 'fail' };
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 3000)),
    ]);
    checks.db = 'ok';
  } catch (e) {
    log.error('health: database check failed', { err: e });
  }

  const healthy = Object.values(checks).every((c) => c === 'ok');
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev',
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
