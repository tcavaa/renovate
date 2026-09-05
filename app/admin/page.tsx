import { sql } from 'drizzle-orm';
import { Package, Hammer, ClipboardList, Building2 } from 'lucide-react';
import { db } from '@/lib/db';
import { products, projects, workers } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L } from '@/lib/i18n/labels';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const ka = getT();
  const locale = getLocale();
  const numberLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
  const [productCount, workerCount, projectCount, totalM2Row] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(products),
    db.select({ c: sql<number>`count(*)` }).from(workers),
    db.select({ c: sql<number>`count(*)` }).from(projects),
    db.select({ s: sql<number>`coalesce(sum(total_m2), 0)` }).from(projects),
  ]);

  const stats = [
    { label: ka.admin.stats.totalProducts, value: Number(productCount[0]?.c ?? 0), icon: Package, color: 'text-brand' },
    { label: ka.admin.stats.totalWorkers, value: Number(workerCount[0]?.c ?? 0), icon: Hammer, color: 'text-accent-dark' },
    { label: ka.admin.stats.totalProjects, value: Number(projectCount[0]?.c ?? 0), icon: ClipboardList, color: 'text-success' },
    { label: ka.admin.stats.totalM2, value: formatM2L(ka, Number(totalM2Row[0]?.s ?? 0)), icon: Building2, color: 'text-slate-deep', isString: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{ka.admin.dashboard}</h1>
        <p className="mt-1 text-sm text-ink-muted">{ka.admin.dashboardSubtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">{s.label}</p>
                  <p className={`mt-2 font-serif text-2xl font-bold ${s.color}`}>
                    {s.isString ? s.value : Number(s.value).toLocaleString(numberLocale)}
                  </p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-30`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
