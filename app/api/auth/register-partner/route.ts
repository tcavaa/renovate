import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores, users, workers } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { registerPartnerSchema } from '@/lib/validations/partner.schema';
import { sendVerificationMail } from '@/lib/auth/tokens';
import { getT } from '@/lib/i18n/server';
import { log } from '@/lib/log';
import { afterResponse } from '@/lib/api/after';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A store or a worker registering themselves.
 *
 * Creates the partner row first — `pending` and inactive, so nothing of theirs is public
 * until admin approves — then the account bound to it with the matching role. The person
 * lands in the partner portal straight away and can fill in products or their card while
 * they wait; approval flips the row live.
 */
export const POST = handle('POST /api/auth/register-partner', 'Registration failed', async (req) => {
  const limited = await rateLimited(req, RATE_RULES.register);
  if (limited) return limited;

  const parsed = registerPartnerSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const input = parsed.data;
  const email = input.email.toLowerCase();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return fail(API_ERRORS.EMAIL_EXISTS, 409);

  const passwordHash = await bcrypt.hash(input.password, 10);
  let storeId: number | null = null;
  let workerId: number | null = null;

  if (input.kind === 'store') {
    const taken = await db.select({ id: stores.id }).from(stores).where(eq(stores.nameKa, input.storeName.trim())).limit(1);
    if (taken.length > 0) return fail(API_ERRORS.STORE_NAME_EXISTS, 409);
    const inserted = await db.insert(stores).values({
      nameKa: input.storeName.trim(),
      phone: input.phone || null,
      email,
      city: input.city || null,
      address: input.address || null,
      websiteUrl: input.websiteUrl || null,
      descriptionKa: input.description || null,
      deliveryDays: input.deliveryDays ?? 3,
      deliveryFeeGel: input.deliveryFeeGel != null ? String(input.deliveryFeeGel) : '0.00',
      rating: '0.00',
      reviewCount: 0,
      approvalStatus: 'pending',
      isActive: false,
    }).returning({ id: stores.id });
    storeId = inserted[0].id;
  } else {
    const inserted = await db.insert(workers).values({
      nameKa: input.name.trim(),
      specialty: input.specialty.trim(),
      specialtySlug: input.specialtySlug,
      phone: input.phone || null,
      email,
      pricePerM2: input.priceUnit === 'm2' && input.pricePerM2 != null ? String(input.pricePerM2) : null,
      pricePerUnit: input.priceUnit === 'unit' && input.pricePerUnit != null ? String(input.pricePerUnit) : null,
      priceUnit: input.priceUnit,
      rating: '5.00',
      reviewCount: 0,
      bio: input.bio || null,
      city: input.city || null,
      experienceYears: input.experienceYears ?? null,
      completedJobs: 0,
      isVerified: false,
      approvalStatus: 'pending',
      isActive: false,
    }).returning({ id: workers.id });
    workerId = inserted[0].id;
  }

  const [{ id }] = await db.insert(users).values({ name: input.name.trim(), email, passwordHash, role: input.kind, storeId, workerId }).returning({ id: users.id });
  log.info('partner registered', { userId: id, kind: input.kind, storeId, workerId });

  // After the answer, not in its way — and not fire-and-forget: a function may be frozen the
  // moment it has answered, and `after` is what it is kept alive for.
  const t = await getT();
  afterResponse(() => sendVerificationMail({ id, email }, t).catch((e) => log.warn('verification mail failed', { userId: id, err: e })));
  return ok({ id, email, kind: input.kind });
});
