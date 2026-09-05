import Link from 'next/link';
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { AlertTriangle, ArrowRight, Calculator, CheckCircle2, ClipboardList, Hammer, Package, Plus, Store, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { categories, products, projects, stores, users, workers } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L, homeStateShortLabel, statusLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { DESIGN_CATEGORY_SLUGS } from '@/lib/design/catalog';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const ka = getT();
  const locale = getLocale();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  const [
    [productStats],
    [categoryCount],
    [storeStats],
    [workerStats],
    [userCount],
    [projectStats],
    recent,
    designCategoryRows,
    [emptyStores],
    [emptyCategories],
  ] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`SUM(${products.isActive} = 1)`,
      })
      .from(products),
    db.select({ c: count() }).from(categories),
    db.select({ total: count(), active: sql<number>`SUM(${stores.isActive} = 1)` }).from(stores),
    db.select({ total: count(), verified: sql<number>`SUM(${workers.isVerified} = 1)` }).from(workers),
    db.select({ c: count() }).from(users),
    db
      .select({
        total: count(),
        saved: sql<number>`SUM(${projects.status} = 'saved')`,
        draft: sql<number>`SUM(${projects.status} = 'draft')`,
        design: sql<number>`SUM(${projects.plan} IS NOT NULL)`,
        totalCost: sql<number>`COALESCE(SUM(${projects.totalCost}), 0)`,
        totalM2: sql<number>`COALESCE(SUM(${projects.totalM2}), 0)`,
        guestsWeek: sql<number>`SUM(${projects.userId} IS NULL AND ${projects.createdAt} >= ${weekAgo})`,
      })
      .from(projects),
    db
      .select({
        id: projects.id,
        nameKa: projects.nameKa,
        homeState: projects.homeState,
        totalM2: projects.totalM2,
        totalCost: projects.totalCost,
        status: projects.status,
        createdAt: projects.createdAt,
        isDesign: isNotNull(projects.plan),
        userName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .orderBy(desc(projects.createdAt))
      .limit(8),
    db.select({ id: categories.id }).from(categories).where(inArray(categories.slug, [...DESIGN_CATEGORY_SLUGS])),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(stores)
      .leftJoin(products, eq(products.storeId, stores.id))
      .where(and(eq(stores.isActive, true), isNull(products.id))),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .where(and(eq(categories.isVisible, true), isNull(products.id))),
  ]);

  const designCategoryIds = designCategoryRows.map((c) => c.id);
  const [noModel] = designCategoryIds.length
    ? await db
        .select({ c: count() })
        .from(products)
        .where(and(eq(products.isActive, true), inArray(products.categoryId, designCategoryIds), isNull(products.model3dUrl)))
    : [{ c: 0 }];

  const d = ka.admin.dash;
  const dateLocale = dateLocaleFor(locale);
  const inactiveProducts = Number(productStats.total) - Number(productStats.active ?? 0);
  const unverifiedWorkers = Number(workerStats.total) - Number(workerStats.verified ?? 0);

  const attention: Array<{ text: string; href: string }> = [];
  if (Number(noModel.c) > 0) attention.push({ text: fill(d.noModelProducts, { n: Number(noModel.c) }), href: '/admin/products?model=none&status=active' });
  if (Number(emptyStores.c) > 0) attention.push({ text: fill(d.emptyStores, { n: Number(emptyStores.c) }), href: '/admin/stores?sort=products&dir=asc' });
  if (Number(emptyCategories.c) > 0) attention.push({ text: fill(d.emptyCategories, { n: Number(emptyCategories.c) }), href: '/admin/categories?sort=products&dir=asc' });
  if (inactiveProducts > 0) attention.push({ text: fill(d.inactiveProducts, { n: inactiveProducts }), href: '/admin/products?status=inactive' });
  if (unverifiedWorkers > 0) attention.push({ text: fill(d.unverifiedWorkers, { n: unverifiedWorkers }), href: '/admin/workers?verified=no' });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">{ka.admin.dashboard}</h1>
          <p className="mt-1 text-sm text-ink-muted">{ka.admin.dashboardSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/admin/products/new">
              <Plus className="h-4 w-4" /> {d.addProduct}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/stores/new">
              <Store className="h-4 w-4" /> {d.addStore}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/workers/new">
              <Hammer className="h-4 w-4" /> {d.addWorker}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/admin/rates">
              <Calculator className="h-4 w-4" /> {d.editRates}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LinkedStat href="/admin/products?status=active" label={d.activeProducts} value={`${productStats.active ?? 0}`} hint={fill(d.ofTotal, { n: Number(productStats.total) })} icon={Package} />
        <LinkedStat href="/admin/stores?status=active" label={d.activeStores} value={`${storeStats.active ?? 0}`} hint={fill(d.ofTotal, { n: Number(storeStats.total) })} icon={Store} />
        <LinkedStat href="/admin/workers?verified=yes" label={d.verifiedWorkers} value={`${workerStats.verified ?? 0}`} hint={fill(d.ofTotal, { n: Number(workerStats.total) })} icon={Hammer} />
        <LinkedStat href="/admin/users" label={d.users} value={`${userCount.c}`} hint={`${categoryCount.c} ${ka.admin.categories.toLowerCase()}`} icon={Users} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={d.savedProjects} value={`${projectStats.saved ?? 0}`} />
        <StatCard label={d.draftProjects} value={`${projectStats.draft ?? 0}`} />
        <StatCard label={d.designProjects} value={`${projectStats.design ?? 0} / ${Number(projectStats.total)}`} />
        <StatCard label={d.plannedTotal} value={formatGEL(Number(projectStats.totalCost))} highlight />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-serif">{d.recentProjects}</CardTitle>
            <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
              {d.viewAll} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-line/40 hover:bg-bg-base/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/orders/${r.id}`} className="font-medium hover:text-brand">
                        {r.nameKa ?? `#${r.id}`}
                      </Link>
                      <span className="block text-xs text-ink-muted">{r.userName ?? ka.admin.guestUser} · {new Date(r.createdAt).toLocaleDateString(dateLocale)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={r.isDesign ? 'secondary' : 'outline'}>{r.isDesign ? ka.admin.filters.designKind : ka.admin.filters.calculatorKind}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{homeStateShortLabel(ka, r.homeState)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatM2L(ka, Number(r.totalM2))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.totalCost ? formatGEL(Number(r.totalCost)) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={r.status === 'saved' ? 'success' : 'outline'}>{statusLabel(ka, r.status ?? 'draft')}</Badge>
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-ink-muted">{ka.admin.projectsEmpty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">{d.attention}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> {d.allGood}
              </p>
            ) : (
              attention.map((a) => (
                <Link key={a.href} href={a.href} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm hover:border-warning/60">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>{a.text}</span>
                </Link>
              ))
            )}
            <p className="pt-2 text-xs text-ink-muted">
              <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
              {fill(d.guestProjects, { n: Number(projectStats.guestsWeek ?? 0) })} · {formatM2L(ka, Number(projectStats.totalM2))}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LinkedStat({
  href,
  label,
  value,
  hint,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href} className="block rounded-lg transition-shadow hover:shadow-cardHover">
      <Card className="h-full">
        <CardContent className="flex items-start justify-between p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
            <p className="mt-2 font-serif text-2xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-ink-muted">{hint}</p>
          </div>
          <Icon className="h-8 w-8 text-brand opacity-30" />
        </CardContent>
      </Card>
    </Link>
  );
}
