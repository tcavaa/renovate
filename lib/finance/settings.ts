import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { platformSettings, type PlatformSettingsRow } from '@/lib/db/schema';
import { log } from '@/lib/log';
import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettings } from './money';

/**
 * The one row of `platform_settings`, or the defaults when it is empty or missing.
 *
 * Same contract as the rate book: an unseeded table is not an error, and admin's change
 * takes effect on the next request without a restart. Every price the platform charges for
 * itself is read through here — the summaries, the checkout, the partner commission.
 */
export interface PlatformSettingsWithMeta extends PlatformSettings {
  updatedAt: Date | null;
}

function fromRow(row: PlatformSettingsRow): PlatformSettingsWithMeta {
  return {
    calculatorFeePerM2: Number(row.calculatorFeePerM2),
    designFeePerM2: Number(row.designFeePerM2),
    storeCommissionPct: Number(row.storeCommissionPct),
    workerCommissionPct: Number(row.workerCommissionPct),
    updatedAt: row.updatedAt,
  };
}

export async function loadPlatformSettings(): Promise<PlatformSettingsWithMeta> {
  try {
    const rows = await db.select().from(platformSettings).orderBy(asc(platformSettings.id)).limit(1);
    if (!rows[0]) return { ...DEFAULT_PLATFORM_SETTINGS, updatedAt: null };
    return fromRow(rows[0]);
  } catch (e) {
    log.warn('platform settings unavailable, using defaults', { err: e });
    return { ...DEFAULT_PLATFORM_SETTINGS, updatedAt: null };
  }
}

export async function savePlatformSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettingsWithMeta> {
  const current = await loadPlatformSettings();
  const next: PlatformSettings = {
    calculatorFeePerM2: patch.calculatorFeePerM2 ?? current.calculatorFeePerM2,
    designFeePerM2: patch.designFeePerM2 ?? current.designFeePerM2,
    storeCommissionPct: patch.storeCommissionPct ?? current.storeCommissionPct,
    workerCommissionPct: patch.workerCommissionPct ?? current.workerCommissionPct,
  };
  const values = {
    calculatorFeePerM2: String(next.calculatorFeePerM2),
    designFeePerM2: String(next.designFeePerM2),
    storeCommissionPct: String(next.storeCommissionPct),
    workerCommissionPct: String(next.workerCommissionPct),
  };
  const existing = await db.select({ id: platformSettings.id }).from(platformSettings).orderBy(asc(platformSettings.id)).limit(1);
  if (existing[0]) await db.update(platformSettings).set(values).where(eq(platformSettings.id, existing[0].id));
  else await db.insert(platformSettings).values(values);
  return { ...next, updatedAt: new Date() };
}
