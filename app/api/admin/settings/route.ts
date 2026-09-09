import { loadPlatformSettings, savePlatformSettings } from '@/lib/finance/settings';
import { platformSettingsSchema } from '@/lib/validations/checkout.schema';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/admin/settings', 'Failed to load settings', async () => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  return ok(await loadPlatformSettings());
});

export const PUT = handle('PUT /api/admin/settings', 'Failed to save settings', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const parsed = platformSettingsSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const saved = await savePlatformSettings(parsed.data);
  log.info('platform settings changed', { by: admin.session.user.id, ...parsed.data });
  return ok(saved);
});
