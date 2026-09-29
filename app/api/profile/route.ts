import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { addressOf } from '@/lib/account/contact';
import { loadAccountContact, updateAccountContact } from '@/lib/account/server';
import { profileSchema } from '@/lib/validations/profile.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in person's own contact — name, e-mail, phone, default delivery address — for the
 * profile's form and for the checkout and booking dialogues, which ask only for what is missing.
 */
export const GET = handle('GET /api/profile', 'Failed to load profile', async () => {
  const { session, response } = await requireSession();
  if (!session) return response;
  const contact = await loadAccountContact(Number(session.user.id));
  if (!contact) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(contact);
});

/** Changes the name, the phone and the default address (`/profile?view=account`). The e-mail stays the sign-in. */
export const PATCH = handle('PATCH /api/profile', 'Failed to save profile', async (req) => {
  const limited = rateLimited(req, RATE_RULES.saveProject);
  if (limited) return limited;
  const { session, response } = await requireSession();
  if (!session) return response;
  const parsed = profileSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.issues[0]?.message === 'PHONE_REQUIRED' ? API_ERRORS.PHONE_REQUIRED : parsed.error.message, 400);
  const userId = Number(session.user.id);
  await updateAccountContact(userId, {
    name: parsed.data.name,
    phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null,
    address: parsed.data.address === undefined ? undefined : addressOf(parsed.data.address),
  });
  return ok(await loadAccountContact(userId));
});
