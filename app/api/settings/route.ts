import { loadPlatformSettings } from '@/lib/finance/settings';
import { handle, ok } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The fees the summaries show. Public: the price of a calculation is not a secret. */
export const GET = handle('GET /api/settings', 'Failed to load settings', async () => {
  const s = await loadPlatformSettings();
  return ok({ calculatorFeePerM2: s.calculatorFeePerM2, designFeePerM2: s.designFeePerM2 });
});
