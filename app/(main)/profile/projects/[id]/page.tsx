import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, Calendar, Hash, Home } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT, getLocale } from '@/lib/i18n/server';
import {
  formatM2L,
  homeStateLabel,
  roomTypeLabel,
  materialLabel,
  workTypeLabel,
  unitLabel,
  statusLabel,
} from '@/lib/i18n/labels';
import { formatGEL, formatNumber } from '@/lib/utils';
import { buildProjectSummary } from '@/lib/calculator/materials';
import type { Room, HomeState, SelectedProduct } from '@/lib/calculator/types';
import type { Dictionary } from '@/lib/i18n/ka';

export const dynamic = 'force-dynamic';

export default async function UserProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const ka = getT();
  const locale = getLocale();
  const userId = Number(session!.user.id);
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);

  const project = rows[0];
  if (!project) notFound();

  const rooms = (project.rooms ?? []) as Room[];
  const selectedProducts = (project.selectedProducts ?? {}) as Record<
    string,
    SelectedProduct
  >;
  const selectedFurniture = (project.selectedFurniture ?? {}) as Record<
    string,
    SelectedProduct[]
  >;

  const productList = Object.values(selectedProducts);
  const furnitureList = Object.values(selectedFurniture).flat();

  const summary = buildProjectSummary(
    rooms,
    project.homeState as HomeState,
    productList,
    furnitureList
  );

  const meta = [
    { icon: Hash, label: 'ID', value: `#${project.id}` },
    {
      icon: Calendar,
      label: ka.profile.metaCreated,
      value: new Date(project.createdAt).toLocaleString(
        locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US'
      ),
    },
    {
      icon: Home,
      label: ka.summary.homeState,
      value: homeStateLabel(ka, project.homeState),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" />
            {ka.profile.backToProjects}
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-bold">
            {project.nameKa ?? ka.profile.fallbackName} —{' '}
            <span className="text-ink-muted">#{project.id}</span>
          </h1>
        </div>
        <Badge variant={project.status === 'saved' ? 'success' : 'outline'}>
          {statusLabel(ka, project.status ?? 'draft')}
        </Badge>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
          {meta.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    {m.label}
                  </p>
                  <p className="truncate text-sm font-medium">{m.value}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={ka.summary.materials}
          value={formatGEL(summary.subtotalMaterials + summary.subtotalProducts)}
        />
        <StatCard
          label={ka.summary.furniture}
          value={formatGEL(summary.subtotalFurniture)}
        />
        <StatCard
          label={ka.summary.workers}
          value={formatGEL(summary.subtotalWorkers)}
        />
        <StatCard
          label={ka.summary.grandTotalWithMargin}
          value={formatGEL(summary.grandTotalWithMargin)}
          highlight
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.rooms}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.rooms.name}</th>
                <th className="px-4 py-3">{ka.rooms.type}</th>
                <th className="px-4 py-3 text-right">{ka.summary.dimsHeader}</th>
                <th className="px-4 py-3 text-right">{ka.rooms.floorM2}</th>
                <th className="px-4 py-3 text-right">{ka.rooms.wallM2}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3 font-medium">{r.nameKa}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {roomTypeLabel(ka, r.type)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {r.width}×{r.length}×{r.height}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatM2L(ka, r.floorM2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatM2L(ka, r.wallM2)}
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <EmptyRow colSpan={5} text={ka.summary.roomsEmpty} />
              )}
            </tbody>
            {rooms.length > 0 && (
              <tfoot className="border-t-2 border-line bg-bg-base font-medium">
                <tr>
                  <td colSpan={3} className="px-4 py-3">
                    {ka.rooms.totalM2}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatM2L(ka, Number(project.totalM2))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.materials}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.summary.item}</th>
                <th className="px-4 py-3 text-right">{ka.summary.qty}</th>
                <th className="px-4 py-3">{ka.summary.unit}</th>
                <th className="px-4 py-3 text-right">{ka.summary.unitPrice}</th>
                <th className="px-4 py-3 text-right">{ka.calculator.total}</th>
              </tr>
            </thead>
            <tbody>
              {summary.materials.map((m) => {
                const total = m.estimatedPriceGEL ? m.qty * m.estimatedPriceGEL : 0;
                return (
                  <tr key={m.key} className="border-b border-line/40 last:border-0">
                    <td className="px-4 py-3 font-medium">{materialLabel(ka, m.key)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(m.qty)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {unitLabel(ka, m.unit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {m.estimatedPriceGEL
                        ? formatGEL(m.estimatedPriceGEL, true)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {total > 0 ? formatGEL(total) : '—'}
                    </td>
                  </tr>
                );
              })}
              {summary.materials.length === 0 && (
                <EmptyRow colSpan={5} text={ka.summary.materialsEmpty} />
              )}
            </tbody>
            {summary.materials.length > 0 && (
              <tfoot className="border-t-2 border-line bg-bg-base font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right">
                    {ka.summary.subtotal}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatGEL(summary.subtotalMaterials)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.products}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <ProductsTable
            items={productList}
            subtotal={summary.subtotalProducts}
            emptyText={ka.summary.productsEmpty}
            t={ka}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.furniture}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <ProductsTable
            items={furnitureList}
            subtotal={summary.subtotalFurniture}
            emptyText={ka.summary.furnitureEmpty}
            t={ka}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.workers}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.summary.item}</th>
                <th className="px-4 py-3 text-right">{ka.summary.qty}</th>
                <th className="px-4 py-3">{ka.summary.unit}</th>
                <th className="px-4 py-3 text-right">{ka.summary.unitPrice}</th>
                <th className="px-4 py-3 text-right">{ka.calculator.total}</th>
              </tr>
            </thead>
            <tbody>
              {summary.workerCosts.map((w) => (
                <tr key={w.key} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3 font-medium">{workTypeLabel(ka, w.key)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(w.qty)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {unitLabel(ka, w.qtyUnit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {formatGEL(w.pricePerQty, true)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatGEL(w.totalGEL)}
                  </td>
                </tr>
              ))}
              {summary.workerCosts.length === 0 && (
                <EmptyRow colSpan={5} text={ka.summary.workEmpty} />
              )}
            </tbody>
            {summary.workerCosts.length > 0 && (
              <tfoot className="border-t-2 border-line bg-bg-base font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right">
                    {ka.summary.subtotal}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatGEL(summary.subtotalWorkers)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.breakdown}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5 text-sm">
          <Row
            label={ka.summary.materials}
            value={formatGEL(summary.subtotalMaterials + summary.subtotalProducts)}
          />
          <Row
            label={ka.summary.furniture}
            value={formatGEL(summary.subtotalFurniture)}
          />
          <Row
            label={ka.summary.workers}
            value={formatGEL(summary.subtotalWorkers)}
          />
          <div className="border-t border-line pt-3">
            <Row
              label={ka.summary.grandTotal}
              value={formatGEL(summary.grandTotal)}
            />
          </div>
          <Row
            label={ka.summary.contingency}
            value={formatGEL(summary.grandTotalWithMargin - summary.grandTotal)}
            muted
          />
          <div className="border-t-2 border-line pt-3">
            <Row
              label={ka.summary.grandTotalWithMargin}
              value={formatGEL(summary.grandTotalWithMargin)}
              big
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-brand bg-brand/5' : undefined}>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p
          className={`mt-2 font-serif text-2xl font-bold tabular-nums ${
            highlight ? 'text-brand-dark' : 'text-ink'
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  big,
  muted,
}: {
  label: string;
  value: string;
  big?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? 'text-ink-muted' : ''}>{label}</span>
      <span
        className={`tabular-nums ${
          big ? 'font-serif text-2xl font-bold text-brand-dark' : 'font-medium'
        } ${muted ? 'text-ink-muted' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-sm text-ink-muted">
        {text}
      </td>
    </tr>
  );
}

function ProductsTable({
  items,
  subtotal,
  emptyText,
  t,
}: {
  items: SelectedProduct[];
  subtotal: number;
  emptyText: string;
  t: Dictionary;
}) {
  const ka = t;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
          <th className="px-4 py-3">{ka.summary.item}</th>
          <th className="px-4 py-3 text-right">{ka.summary.qty}</th>
          <th className="px-4 py-3">{ka.summary.unit}</th>
          <th className="px-4 py-3 text-right">{ka.summary.unitPrice}</th>
          <th className="px-4 py-3 text-right">{ka.calculator.total}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p, idx) => (
          <tr
            key={`${p.productId}-${idx}`}
            className="border-b border-line/40 last:border-0"
          >
            <td className="px-4 py-3 font-medium">{p.nameKa}</td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatNumber(p.qty)}
            </td>
            <td className="px-4 py-3 text-ink-muted">{unitLabel(ka, p.unit)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
              {formatGEL(p.pricePerUnit, true)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatGEL(p.totalPrice)}
            </td>
          </tr>
        ))}
        {items.length === 0 && <EmptyRow colSpan={5} text={emptyText} />}
      </tbody>
      {items.length > 0 && (
        <tfoot className="border-t-2 border-line bg-bg-base font-semibold">
          <tr>
            <td colSpan={4} className="px-4 py-3 text-right">
              {ka.summary.subtotal}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatGEL(subtotal)}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
