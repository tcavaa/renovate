import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { ratesForAdmin } from '@/lib/calculator/rates';
import { RatesTable } from '@/components/admin/RatesTable';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

/**
 * The calculator's rate book. Every number the estimate is built from lives here, so a
 * price that moved on the market this week is a field, not a deploy.
 */
export default async function AdminRatesPage() {
  await requireAdminPage('rates');
  const ka = await getT();
  const rows = await db.select().from(rates).orderBy(asc(rates.phase), asc(rates.sortOrder), asc(rates.id));

  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'rates', true)]} title={ka.admin.rates} subtitle={<span className="block max-w-2xl">{ka.admin.ratesSubtitle}</span>} />
      <RatesTable
        // Every rate the estimate uses: the table's rows, and the shipped defaults it has no row
        // for yet (negative ids — saving one creates it). Retired keys are left out.
        initialRows={ratesForAdmin(rows.map((r) => ({
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
        })))}
      />
    </div>
  );
}
