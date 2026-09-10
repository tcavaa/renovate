import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { getT } from '@/lib/i18n/server';
import { loadPartnerContext } from '@/lib/partner/context';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { effectiveCommissionPct } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { WorkerSelfForm } from '@/components/partner/WorkerSelfForm';
import { formatGEL, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** A worker's own card: what customers see, the commission the platform keeps, and the form to change the service and price. */
export default async function PartnerProfilePage(props: { searchParams: Promise<{ store?: string; worker?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const ctx = await loadPartnerContext(search);
  if (!ctx || ctx.type !== 'worker' || !ctx.ref.workerId) return null;
  const [worker] = await db.select().from(workers).where(eq(workers.id, ctx.ref.workerId)).limit(1);
  if (!worker) return null;
  const settings = await loadPlatformSettings();
  const pct = effectiveCommissionPct(worker.commissionRate, settings.workerCommissionPct);
  const price = worker.priceUnit === 'm2' && worker.pricePerM2 ? `${formatGEL(Number(worker.pricePerM2))} ${t.workers.perM2Slash}` : worker.pricePerUnit ? `${formatGEL(Number(worker.pricePerUnit))} ${t.workers.perPieceSlash}` : t.workers.priceByAgreement;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t.partner.workerAccount}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">{worker.nameKa}</h1>
          <p className="mt-1 text-sm text-ink-muted">{worker.specialty}</p>
        </div>
        {worker.isActive && (
          <Button asChild variant="outline">
            <Link href={`/workers/${worker.id}`}>
              {t.partner.publicProfile}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
      <dl className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t.workers.priceLabel, price],
          [t.workers.rating, `${formatNumber(Number(worker.rating))} / 5`],
          [t.workers.reviews, String(worker.reviewCount ?? 0)],
          [t.partner.commissionRateLabel, `${formatNumber(pct)}%`],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-r border-line px-4 py-4">
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-1 font-serif text-xl font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {/* Admin previewing a worker edits them in admin; the worker edits themselves here. */}
      {ctx.isAdmin ? (
        <Button asChild variant="outline">
          <Link href={`/admin/workers/${worker.id}`}>{t.admin.actions.edit}</Link>
        </Button>
      ) : (
        <WorkerSelfForm worker={worker} />
      )}
    </div>
  );
}
