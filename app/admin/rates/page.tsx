import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { RatesTable } from '@/components/admin/RatesTable';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * The calculator's rate book. Every number the estimate is built from lives here, so a
 * price that moved on the market this week is a field, not a deploy.
 */
export default async function AdminRatesPage() {
  const ka = await getT();
  const rows = await db.select().from(rates).orderBy(asc(rates.phase), asc(rates.sortOrder), asc(rates.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{ka.admin.rates}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{ka.admin.ratesSubtitle}</p>
      </div>
      <RatesTable
        initialRows={rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          key: r.key,
          labelKa: r.labelKa,
          phase: r.phase,
          unit: r.unit,
          basis: r.basis,
          qtyPerM2: r.qtyPerM2,
          wasteFactorPct: r.wasteFactorPct,
          pricePerUnit: r.pricePerUnit,
          linkedCategorySlug: r.linkedCategorySlug,
          sortOrder: r.sortOrder,
          isActive: r.isActive,
        }))}
      />
    </div>
  );
}
