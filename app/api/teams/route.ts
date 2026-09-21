import { fail, handle, ok, requireStaff } from '@/lib/api/route';
import { db } from '@/lib/db';
import { teamMembers, teams } from '@/lib/db/schema';
import { listTeams } from '@/lib/teams/queries';
import { teamRow, teamSchema } from '@/lib/validations/team.schema';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The brigades, for the design's last step. `?covers=tiler,electrician` puts the teams that
 * cover the job first; the rest are still returned, with their gaps, because half a brigade
 * plus one trade is a real way to hire.
 */
export const POST = handle('POST /api/teams', 'Failed to create team', async (req) => {
  const staff = await requireStaff('teams');
  if (staff.response) return staff.response;
  const parsed = teamSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { memberIds, leadWorkerId, ...fields } = parsed.data;
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(teams).values(teamRow(fields, fields.slug || slugify(fields.nameKa)));
    const teamId = Number(row.insertId);
    if (memberIds.length > 0) {
      await tx.insert(teamMembers).values(memberIds.map((workerId, i) => ({ teamId, workerId, isLead: workerId === leadWorkerId, sortOrder: i })));
    }
    return teamId;
  });
  return ok({ id });
});

export const GET = handle('GET /api/teams', 'Failed to load teams', async (req) => {
  const url = new URL(req.url);
  const covers = (url.searchParams.get('covers') ?? '').split(',').filter(Boolean);
  const city = url.searchParams.get('city');
  const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit') ?? 12) || 12));
  const rows = await listTeams({ covers, city, limit });
  return ok(
    rows.map((r) => ({
      id: r.team.id,
      slug: r.team.slug,
      nameKa: r.team.nameKa,
      nameEn: r.team.nameEn,
      nameRu: r.team.nameRu,
      city: r.team.city,
      logoUrl: r.team.logoUrl,
      rating: r.team.rating,
      reviewCount: r.team.reviewCount,
      completedJobs: r.team.completedJobs,
      isVerified: r.team.isVerified,
      leadName: r.team.leadName,
      markupPct: r.team.markupPct,
      trades: r.trades,
      memberCount: r.members.length,
      covered: r.covered,
      // Whether it can take another job now: open orders against what it says it can run.
      available: r.available,
      openJobs: r.openJobs,
      capacityJobs: r.team.capacityJobs,
    }))
  );
});
