import Link from 'next/link';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { AlertTriangle, ArrowRight, Calculator, CheckCircle2, ClipboardList, FolderTree, Hammer, Package, Plus, Receipt, Send, Settings, Store, TrendingUp, UserPlus, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { categories, orders, products, projects, stores, users, workers } from '@/lib/db/schema';
import { revenueReport } from '@/lib/finance/report';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { periodRange } from '@/lib/finance/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L, homeStateShortLabel, statusLabel } from '@/lib/i18n/labels';
import { fill, inIdOrder } from '@/lib/admin/list';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { DESIGN_CATEGORY_SLUGS } from '@/lib/design/catalog';
import { formatGEL, TIME_ZONE } from '@/lib/utils';
import { canAdmin, type AdminSection } from '@/lib/auth/roles';
import { requireAdminPage } from '@/lib/admin/guard';
import { AdminCrumbs } from '@/components/admin/AdminCrumbs';
import { subtreeOfSlugs } from '@/lib/catalog/tree';
import { loadCategoryTree } from '@/lib/catalog/queries';

export const dynamic = 'force-dynamic';

/**
 * The newest projects, for the dashboard. Picked on the ids alone, then read by id
 * (`inIdOrder`), as the projects list is: `isDesign` reads the plan, and a sort carries it whole.
 */
async function recentProjects(limit: number) {
  const ids = (await db.select({ id: projects.id }).from(projects).orderBy(desc(projects.createdAt)).limit(limit)).map((row) => row.id);
  if (ids.length === 0) return [];
  const rows = await db
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
    .where(inArray(projects.id, ids));
  return inIdOrder(ids, rows);
}

/**
 * The admin's first page, cut to the role looking at it: every button, figure and "needs
 * attention" line belongs to a section (`lib/auth/roles`), and only the sections the account
 * has are shown. The orders agent opens it on the queue of store orders waiting to be
 * confirmed; the catalogue agent on the catalogue's gaps (photos, 3D models, stores waiting for
 * approval); admin sees all of it, the money included. What a role does not see is not even
 * queried where it costs something (the revenue report).
 */
export default async function AdminDashboardPage() {
  const session = await requireAdminPage('dashboard');
  const ka = await getT();
  const locale = await getLocale();
  const role = session.user.role;
  const may = (section: AdminSection) => canAdmin(role, section);
  const d = ka.admin.dash;
  const s = ka.staffDashboard;
  const r = ka.orderReview;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const settings = await loadPlatformSettings();

  // Store orders the platform has not confirmed and sent yet: the orders agent's queue.
  const awaiting: SQL = and(eq(orders.partnerType, 'store'), isNull(orders.sentAt), notInArray(orders.status, ['cancelled', 'done']))!;
  // The materials supplier sells no catalogue products by design; it is not an "empty store".
  const emptyStoreCondition = and(eq(stores.isActive, true), isNull(products.id), settings.materialsStoreId != null ? ne(stores.id, settings.materialsStoreId) : undefined);

  const [
    [productStats],
    [categoryCount],
    [storeStats],
    [workerStats],
    [userCount],
    [projectStats],
    recent,
    categoryTree,
    [emptyStores],
    [emptyCategories],
    [orderStats],
    queue,
    [partnersNoEmail],
    [storesNoAccount],
  ] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`SUM(${products.isActive} = 1)`,
        noPhoto: sql<number>`SUM(${products.isActive} = 1 AND (${products.imageUrl} IS NULL OR ${products.imageUrl} = ''))`,
      })
      .from(products)
      .where(isNull(products.ownerUserId)),
    db.select({ c: count() }).from(categories),
    db.select({ total: count(), active: sql<number>`SUM(${stores.isActive} = 1)`, pending: sql<number>`SUM(${stores.approvalStatus} = 'pending')` }).from(stores),
    db.select({ total: count(), verified: sql<number>`SUM(${workers.isVerified} = 1)`, pending: sql<number>`SUM(${workers.approvalStatus} = 'pending')` }).from(workers),
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
    recentProjects(8),
    loadCategoryTree(),
    db.select({ c: sql<number>`COUNT(*)` }).from(stores).leftJoin(products, eq(products.storeId, stores.id)).where(emptyStoreCondition),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      // A group holds its subcategories, not products: only a category with nothing under it is empty.
      .where(and(eq(categories.isVisible, true), isNull(products.id), sql`NOT EXISTS (SELECT 1 FROM ${categories} AS child WHERE child.parent_id = ${categories.id})`)),
    db
      .select({
        toConfirm: sql<number>`SUM(${orders.partnerType} = 'store' AND ${orders.sentAt} IS NULL AND ${orders.status} NOT IN ('cancelled','done'))`,
        waitingPartner: sql<number>`SUM(${orders.sentAt} IS NOT NULL AND ${orders.status} = 'new')`,
        inWork: sql<number>`SUM(${orders.sentAt} IS NOT NULL AND ${orders.status} IN ('confirmed','in_progress'))`,
        doneMonth: sql<number>`SUM(${orders.status} = 'done' AND ${orders.updatedAt} >= ${monthStart})`,
      })
      .from(orders),
    may('orders')
      ? db
          .select({ id: orders.id, projectId: orders.projectId, storeName: stores.nameKa, customerName: orders.customerName, customerPhone: orders.customerPhone, subtotal: orders.subtotal, deliveryFee: orders.deliveryFee, createdAt: orders.createdAt })
          .from(orders)
          .leftJoin(stores, eq(orders.storeId, stores.id))
          .where(awaiting)
          .orderBy(asc(orders.createdAt))
          .limit(8)
      : Promise.resolve([]),
    db.select({ c: sql<number>`(SELECT COUNT(*) FROM ${stores} WHERE ${stores.isActive} = 1 AND (${stores.email} IS NULL OR ${stores.email} = '')) + (SELECT COUNT(*) FROM ${workers} WHERE ${workers.isActive} = 1 AND (${workers.email} IS NULL OR ${workers.email} = ''))` }).from(sql`(SELECT 1) AS one`),
    db.select({ c: sql<number>`COUNT(*)` }).from(stores).where(and(eq(stores.isActive, true), sql`NOT EXISTS (SELECT 1 FROM ${users} WHERE ${users.storeId} = ${stores.id})`)),
  ]);

  // The studio's categories and everything filed under them.
  const designCategoryIds = [...subtreeOfSlugs(categoryTree, DESIGN_CATEGORY_SLUGS)];
  const [[noModel], monthRevenue] = await Promise.all([
    designCategoryIds.length
      ? db
          .select({ c: count() })
          .from(products)
          .where(and(eq(products.isActive, true), inArray(products.categoryId, designCategoryIds), isNull(products.model3dUrl), isNull(products.ownerUserId)))
      : Promise.resolve([{ c: 0 }]),
    // The money is admin's: nobody else's dashboard even asks for it.
    may('revenue') ? revenueReport(periodRange('month')) : Promise.resolve(null),
  ]);

  const dateLocale = dateLocaleFor(locale);
  const n = (v: unknown) => Number(v ?? 0);
  const toConfirm = n(orderStats.toConfirm);
  const inactiveProducts = n(productStats.total) - n(productStats.active);
  const unverifiedWorkers = n(workerStats.total) - n(workerStats.verified);

  const attentionAll: Array<{ section: AdminSection; text: string; href: string; show: boolean }> = [
    { section: 'orders', text: fill(s.toConfirmAttention, { n: toConfirm }), href: '/admin/orders?review=pending', show: toConfirm > 0 },
    { section: 'orders', text: fill(s.waitingPartnerAttention, { n: n(orderStats.waitingPartner) }), href: '/admin/orders?review=sent&status=new', show: n(orderStats.waitingPartner) > 0 },
    { section: 'stores', text: fill(s.pendingStoresAttention, { n: n(storeStats.pending) }), href: '/admin/stores?status=pending', show: n(storeStats.pending) > 0 },
    { section: 'workers', text: fill(s.pendingWorkersAttention, { n: n(workerStats.pending) }), href: '/admin/workers?status=pending', show: n(workerStats.pending) > 0 },
    { section: 'stores', text: fill(d.partnersWithoutEmail, { n: n(partnersNoEmail.c) }), href: '/admin/stores', show: n(partnersNoEmail.c) > 0 },
    { section: 'users', text: fill(d.partnersWithoutAccount, { n: n(storesNoAccount.c) }), href: '/admin/users?role=store', show: n(storesNoAccount.c) > 0 },
    { section: 'products', text: fill(d.noModelProducts, { n: n(noModel.c) }), href: '/admin/products?model=none&status=active', show: n(noModel.c) > 0 },
    { section: 'stores', text: fill(d.emptyStores, { n: n(emptyStores.c) }), href: '/admin/stores?sort=products&dir=asc', show: n(emptyStores.c) > 0 },
    { section: 'categories', text: fill(d.emptyCategories, { n: n(emptyCategories.c) }), href: '/admin/categories?show=empty', show: n(emptyCategories.c) > 0 },
    { section: 'products', text: fill(d.inactiveProducts, { n: inactiveProducts }), href: '/admin/products?status=inactive', show: inactiveProducts > 0 },
    { section: 'workers', text: fill(d.unverifiedWorkers, { n: unverifiedWorkers }), href: '/admin/workers?verified=no', show: unverifiedWorkers > 0 },
  ];
  const attention = attentionAll.filter((a) => a.show && may(a.section));

  // Each button belongs to a section: an agent is offered only what their job covers.
  const actions: Array<{ section: AdminSection; href: string; label: string; icon: React.ComponentType<{ className?: string }>; variant: 'default' | 'outline' | 'ghost' }> = [
    { section: 'orders' as const, href: '/admin/orders?review=pending', label: `${r.queueTitle} · ${toConfirm}`, icon: Send, variant: 'default' as const },
    { section: 'products' as const, href: '/admin/products/new', label: d.addProduct, icon: Plus, variant: 'default' as const },
    { section: 'stores' as const, href: '/admin/stores/new', label: d.addStore, icon: Store, variant: 'outline' as const },
    { section: 'categories' as const, href: '/admin/categories/new', label: s.addCategory, icon: FolderTree, variant: 'outline' as const },
    { section: 'workers' as const, href: '/admin/workers/new', label: d.addWorker, icon: Hammer, variant: 'outline' as const },
    { section: 'users' as const, href: '/admin/users/new', label: ka.accounts.newUser, icon: UserPlus, variant: 'outline' as const },
    { section: 'rates' as const, href: '/admin/rates', label: d.editRates, icon: Calculator, variant: 'ghost' as const },
    { section: 'settings' as const, href: '/admin/settings', label: d.openSettings, icon: Settings, variant: 'ghost' as const },
  ].filter((a) => may(a.section));
  // One filled button at most: the first of the role's own.
  const firstPrimary = actions.findIndex((a) => a.variant === 'default');

  const subtitle = (s.subtitles as Record<string, string>)[role] ?? ka.admin.dashboardSubtitle;

  return (
    <div className="space-y-6">
      <AdminCrumbs trail={[]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">{ka.admin.dashboard}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <Button key={a.href} asChild size="sm" variant={a.variant === 'default' ? (i === firstPrimary ? 'default' : 'outline') : a.variant}>
              <Link href={a.href}>
                <a.icon className="h-4 w-4" /> {a.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {may('orders') && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LinkedStat href="/admin/orders?review=pending" label={s.toConfirm} value={`${toConfirm}`} hint={s.toConfirmHint} icon={Send} highlight={toConfirm > 0} />
          <LinkedStat href="/admin/orders?review=sent&status=new" label={s.waitingPartner} value={`${n(orderStats.waitingPartner)}`} hint={s.waitingPartnerHint} icon={Receipt} />
          <LinkedStat href="/admin/orders?review=sent" label={s.inWork} value={`${n(orderStats.inWork)}`} hint={s.inWorkHint} icon={ClipboardList} />
          <LinkedStat href="/admin/orders?status=done" label={s.doneMonth} value={`${n(orderStats.doneMonth)}`} hint={s.doneMonthHint} icon={CheckCircle2} />
        </div>
      )}

      {monthRevenue && (
        <div className="grid gap-4 sm:grid-cols-3">
          <LinkedStat href="/admin/revenue?period=month" label={d.revenueMonth} value={formatGEL(monthRevenue.revenue)} hint={fill(d.revenueMonthHint, { fees: formatGEL(monthRevenue.fees.total), commissions: formatGEL(monthRevenue.commissions.total) })} icon={TrendingUp} />
          <LinkedStat href="/admin/revenue?period=month" label={ka.admin.revenue.gmv} value={formatGEL(monthRevenue.gmv.total)} hint={fill(ka.admin.revenue.ordersCount, { n: monthRevenue.commissions.orders })} icon={Store} />
          <LinkedStat href="/admin/revenue?period=month" label={ka.admin.revenue.fees} value={formatGEL(monthRevenue.fees.total)} hint={fill(ka.admin.revenue.checkoutsCount, { n: monthRevenue.fees.count })} icon={Calculator} />
        </div>
      )}

      {(may('products') || may('stores')) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {may('products') && <LinkedStat href="/admin/products?status=active" label={d.activeProducts} value={`${n(productStats.active)}`} hint={fill(d.ofTotal, { n: n(productStats.total) })} icon={Package} />}
          {may('products') && <LinkedStat href="/admin/products?status=active&photo=none" label={s.noPhoto} value={`${n(productStats.noPhoto)}`} hint={s.noPhotoHint} icon={Package} />}
          {may('products') && <LinkedStat href="/admin/products?model=none&status=active" label={s.no3d} value={`${n(noModel.c)}`} hint={s.no3dHint} icon={Package} />}
          {may('stores') && <LinkedStat href="/admin/stores?status=pending" label={s.pendingStores} value={`${n(storeStats.pending)}`} hint={`${d.activeStores}: ${n(storeStats.active)} / ${n(storeStats.total)}`} icon={Store} highlight={n(storeStats.pending) > 0} />}
        </div>
      )}

      {(may('workers') || may('users')) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {may('workers') && <LinkedStat href="/admin/workers?verified=yes" label={d.verifiedWorkers} value={`${n(workerStats.verified)}`} hint={fill(d.ofTotal, { n: n(workerStats.total) })} icon={Hammer} />}
          {may('users') && <LinkedStat href="/admin/users" label={d.users} value={`${n(userCount.c)}`} hint={`${n(categoryCount.c)} ${ka.admin.categories.toLowerCase()}`} icon={Users} />}
        </div>
      )}

      {may('projects') && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={d.savedProjects} value={`${n(projectStats.saved)}`} />
          <StatCard label={d.draftProjects} value={`${n(projectStats.draft)}`} />
          <StatCard label={d.designProjects} value={`${n(projectStats.design)} / ${n(projectStats.total)}`} />
          <StatCard label={d.plannedTotal} value={formatGEL(n(projectStats.totalCost))} highlight />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {may('orders') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">{r.queueTitle}</CardTitle>
                <Link href="/admin/orders?review=pending" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                  {s.queueViewAll} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {queue.map((o) => (
                      <tr key={o.id} className="border-t border-line/40 hover:bg-bg-base/60">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/orders/${o.id}`} className="font-medium hover:text-brand">
                            #{o.id} · {o.storeName ?? '—'}
                          </Link>
                          <span className="block text-xs text-ink-muted">
                            {o.customerName} · {o.customerPhone} · {new Date(o.createdAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE })}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatGEL(Number(o.subtotal))}
                          {Number(o.deliveryFee) > 0 && <span className="block text-xs text-ink-muted">+ {formatGEL(Number(o.deliveryFee))}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link href={o.projectId ? `/admin/projects/${o.projectId}#orders` : `/admin/orders/${o.id}`}>{s.queueOpen}</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {queue.length === 0 && (
                      <tr>
                        <td className="px-4 py-10 text-center text-ink-muted">{r.queueEmpty}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {may('projects') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">{d.recentProjects}</CardTitle>
                <Link href="/admin/projects" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                  {d.viewAll} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {recent.map((p) => (
                      <tr key={p.id} className="border-t border-line/40 hover:bg-bg-base/60">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/projects/${p.id}`} className="font-medium hover:text-brand">
                            {p.nameKa ?? `#${p.id}`}
                          </Link>
                          <span className="block text-xs text-ink-muted">
                            {p.userName ?? ka.admin.guestUser} · {new Date(p.createdAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE })}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={p.isDesign ? 'secondary' : 'outline'}>{p.isDesign ? ka.admin.filters.designKind : ka.admin.filters.calculatorKind}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-ink-muted">{p.homeState ? homeStateShortLabel(ka, p.homeState) : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatM2L(ka, Number(p.totalM2))}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{p.totalCost ? formatGEL(Number(p.totalCost)) : '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={p.status === 'saved' ? 'success' : 'outline'}>{statusLabel(ka, p.status ?? 'draft')}</Badge>
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
          )}
        </div>

        <Card className="self-start">
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
                <Link key={a.href + a.text} href={a.href} className="flex items-start gap-2 border border-warning/30 bg-warning/5 px-3 py-2 text-sm hover:border-warning/60">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>{a.text}</span>
                </Link>
              ))
            )}
            {may('projects') && (
              <p className="pt-2 text-xs text-ink-muted">
                <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
                {fill(d.guestProjects, { n: n(projectStats.guestsWeek) })} · {formatM2L(ka, n(projectStats.totalM2))}
              </p>
            )}
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
  highlight,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block transition-shadow hover:shadow-cardHover">
      <Card className={highlight ? 'h-full border-warning/60 bg-warning/5' : 'h-full'}>
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
