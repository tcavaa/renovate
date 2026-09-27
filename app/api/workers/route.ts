import { and, eq, desc } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { workerSchema } from '@/lib/validations/worker.schema';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';
import { publicWorker } from '@/lib/api/publicPartners';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The active workers. Admin gets the whole rows; everybody else the approved ones, with the
 * fields a customer needs (`lib/api/publicPartners`) — never the commission or the e-mail.
 */
export const GET = handle('GET /api/workers', 'Failed to load workers', async (req) => {
  const { searchParams } = new URL(req.url);
  const specialty = searchParams.get('specialty');
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  const conditions = [eq(workers.isActive, true)];
  if (!isAdmin) conditions.push(eq(workers.approvalStatus, 'approved'));
  if (specialty) conditions.push(eq(workers.specialtySlug, specialty));

  const data = await db
    .select()
    .from(workers)
    .where(and(...conditions))
    .orderBy(desc(workers.isVerified), desc(workers.rating));
  return ok(isAdmin ? data : data.map(publicWorker));
});

export const POST = handle('POST /api/workers', 'Failed to create worker', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const parsed = workerSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const d = parsed.data;
  const inserted = await db.insert(workers).values({
    nameKa: d.nameKa,
    specialty: d.specialty,
    specialtySlug: d.specialtySlug,
    phone: d.phone ?? null,
    email: d.email || null,
    commissionRate: d.commissionRate != null ? String(d.commissionRate) : null,
    pricePerM2: d.pricePerM2 != null ? String(d.pricePerM2) : null,
    pricePerUnit: d.pricePerUnit != null ? String(d.pricePerUnit) : null,
    priceUnit: d.priceUnit,
    rating: d.rating != null ? String(d.rating) : '5.00',
    reviewCount: d.reviewCount ?? 0,
    bio: d.bio ?? null,
    avatarUrl: d.avatarUrl || null,
    city: d.city || null,
    experienceYears: d.experienceYears ?? null,
    completedJobs: d.completedJobs ?? 0,
    isVerified: d.isVerified,
    isActive: d.isActive,
  });
  return ok({ id: inserted[0].insertId });
});
