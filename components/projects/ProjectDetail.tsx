import Link from 'next/link';
import { ArrowLeft, Calendar, Hash, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { MoneyRow } from '@/components/ui/money-row';
import type { Project } from '@/lib/db/schema';
import type { Dictionary } from '@/lib/i18n/ka';
import type { Locale } from '@/lib/i18n';
import {
  formatM2L,
  homeStateLabel,
  roomTypeLabel,
  materialLabel,
  workTypeLabel,
  unitLabel,
  statusLabel,
  localizedName,
} from '@/lib/i18n/labels';
import { formatGEL, formatNumber } from '@/lib/utils';
import type { ProjectSummary, Room, SelectedProduct } from '@/lib/calculator/types';

/**
 * A saved calculator project, in full: meta, rooms, materials, products, furniture, labour
 * and the cost breakdown.
 *
 * Rendered identically for the owner (`/profile/projects/[id]`) and for admin
 * (`/admin/orders/[id]`); only the back link and any extra meta rows differ. Server
 * component — the caller loads the project and prices it with the current rate book.
 */
export interface MetaItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

export function dateLocaleFor(locale: Locale): string {
  return locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
}

export function ProjectDetail({
  project,
  summary,
  t,
  locale,
  backHref,
  backLabel,
  extraMeta = [],
}: {
  project: Project;
  summary: ProjectSummary;
  t: Dictionary;
  locale: Locale;
  backHref: string;
  backLabel: string;
  extraMeta?: MetaItem[];
}) {
  const ka = t;
  const rooms = summary.rooms as Room[];

  const meta: MetaItem[] = [
    { icon: Hash, label: 'ID', value: `#${project.id}` },
    {
      icon: Calendar,
      label: ka.profile.metaCreated,
      value: new Date(project.createdAt).toLocaleString(dateLocaleFor(locale)),
    },
    { icon: Home, label: ka.summary.homeState, value: homeStateLabel(ka, project.homeState) },
    ...extraMeta,
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
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
        <CardContent
          className={
            meta.length > 3
              ? 'grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4'
              : 'grid gap-4 p-5 sm:grid-cols-3'
          }
        >
          {meta.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">{m.label}</p>
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
        <StatCard label={ka.summary.furniture} value={formatGEL(summary.subtotalFurniture)} />
        <StatCard label={ka.summary.workers} value={formatGEL(summary.subtotalWorkers)} />
        <StatCard
          label={ka.summary.grandTotalWithMargin}
          value={formatGEL(summary.grandTotalWithMargin)}
          highlight
        />
      </div>

      <Section title={ka.summary.rooms}>
        <table className="w-full text-sm">
          <thead>
            <HeadRow>
              <th className="px-4 py-3">{ka.rooms.name}</th>
              <th className="px-4 py-3">{ka.rooms.type}</th>
              <th className="px-4 py-3 text-right">{ka.summary.dimsHeader}</th>
              <th className="px-4 py-3 text-right">{ka.rooms.floorM2}</th>
              <th className="px-4 py-3 text-right">{ka.rooms.wallM2}</th>
              <th className="px-4 py-3 text-right">{ka.rooms.perimeter}</th>
            </HeadRow>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id} className="border-b border-line/40 last:border-0">
                <td className="px-4 py-3 font-medium">
                  {r.nameKa}
                  {r.isWetRoom && (
                    <Badge className="ml-2" variant="outline">
                      {ka.rooms.wet}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{roomTypeLabel(ka, r.type)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                  {r.width}×{r.length}×{r.height}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatM2L(ka, r.floorM2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatM2L(ka, r.wallM2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatNumber(r.perimeterM)} {ka.units.m}
                </td>
              </tr>
            ))}
            {rooms.length === 0 && <EmptyRow colSpan={6} text={ka.summary.roomsEmpty} />}
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
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </Section>

      <Section title={ka.summary.materials}>
        <table className="w-full text-sm">
          <thead>
            <HeadRow>
              <th className="px-4 py-3">{ka.summary.item}</th>
              <th className="px-4 py-3 text-right">{ka.summary.qty}</th>
              <th className="px-4 py-3">{ka.summary.unit}</th>
              <th className="px-4 py-3 text-right">{ka.summary.unitPrice}</th>
              <th className="px-4 py-3 text-right">{ka.calculator.total}</th>
            </HeadRow>
          </thead>
          <tbody>
            {summary.materials.map((m) => {
              const total = m.estimatedPriceGEL ? m.qty * m.estimatedPriceGEL : 0;
              return (
                <tr key={m.key} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3 font-medium">{materialLabel(ka, m.key)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(m.qty)}</td>
                  <td className="px-4 py-3 text-ink-muted">{unitLabel(ka, m.unit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {m.estimatedPriceGEL ? formatGEL(m.estimatedPriceGEL, true) : '—'}
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
          <SubtotalFoot show={summary.materials.length > 0} label={ka.summary.subtotal} value={summary.subtotalMaterials} />
        </table>
      </Section>

      <Section title={ka.summary.products}>
        <ProductsTable
          items={summary.products}
          subtotal={summary.subtotalProducts}
          emptyText={ka.summary.productsEmpty}
          t={ka}
          locale={locale}
        />
      </Section>

      <Section title={ka.summary.furniture}>
        <ProductsTable
          items={summary.furniture}
          subtotal={summary.subtotalFurniture}
          emptyText={ka.summary.furnitureEmpty}
          t={ka}
          locale={locale}
        />
      </Section>

      <Section title={ka.summary.workers}>
        <table className="w-full text-sm">
          <thead>
            <HeadRow>
              <th className="px-4 py-3">{ka.summary.item}</th>
              <th className="px-4 py-3 text-right">{ka.summary.qty}</th>
              <th className="px-4 py-3">{ka.summary.unit}</th>
              <th className="px-4 py-3 text-right">{ka.summary.unitPrice}</th>
              <th className="px-4 py-3 text-right">{ka.calculator.total}</th>
            </HeadRow>
          </thead>
          <tbody>
            {summary.workerCosts.map((w) => (
              <tr key={w.key} className="border-b border-line/40 last:border-0">
                <td className="px-4 py-3 font-medium">{workTypeLabel(ka, w.key)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(w.qty)}</td>
                <td className="px-4 py-3 text-ink-muted">{unitLabel(ka, w.qtyUnit)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                  {formatGEL(w.pricePerQty, true)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatGEL(w.totalGEL)}</td>
              </tr>
            ))}
            {summary.workerCosts.length === 0 && (
              <EmptyRow colSpan={5} text={ka.summary.workEmpty} />
            )}
          </tbody>
          <SubtotalFoot show={summary.workerCosts.length > 0} label={ka.summary.subtotal} value={summary.subtotalWorkers} />
        </table>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.summary.breakdown}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          <MoneyRow
            label={ka.summary.materials}
            value={summary.subtotalMaterials + summary.subtotalProducts}
          />
          <MoneyRow label={ka.summary.furniture} value={summary.subtotalFurniture} />
          <MoneyRow label={ka.summary.workers} value={summary.subtotalWorkers} />
          <div className="border-t border-line pt-3">
            <MoneyRow label={ka.summary.grandTotal} value={summary.grandTotal} />
          </div>
          <MoneyRow
            label={ka.summary.contingency}
            value={summary.grandTotalWithMargin - summary.grandTotal}
            muted
          />
          <div className="border-t-2 border-line pt-3">
            <MoneyRow label={ka.summary.grandTotalWithMargin} value={summary.grandTotalWithMargin} big />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table building blocks
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function HeadRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-sm text-ink-muted">
        {text}
      </td>
    </tr>
  );
}

function SubtotalFoot({ show, label, value }: { show: boolean; label: string; value: number }) {
  if (!show) return null;
  return (
    <tfoot className="border-t-2 border-line bg-bg-base font-semibold">
      <tr>
        <td colSpan={4} className="px-4 py-3 text-right">
          {label}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{formatGEL(value)}</td>
      </tr>
    </tfoot>
  );
}

export function ProductsTable({
  items,
  subtotal,
  emptyText,
  t,
  locale,
}: {
  items: SelectedProduct[];
  subtotal: number;
  emptyText: string;
  t: Dictionary;
  locale: Locale;
}) {
  const ka = t;
  return (
    <table className="w-full text-sm">
      <thead>
        <HeadRow>
          <th className="px-4 py-3">{ka.summary.item}</th>
          <th className="px-4 py-3 text-right">{ka.summary.qty}</th>
          <th className="px-4 py-3">{ka.summary.unit}</th>
          <th className="px-4 py-3 text-right">{ka.summary.unitPrice}</th>
          <th className="px-4 py-3 text-right">{ka.calculator.total}</th>
        </HeadRow>
      </thead>
      <tbody>
        {items.map((p, idx) => (
          <tr key={`${p.productId}-${idx}`} className="border-b border-line/40 last:border-0">
            <td className="px-4 py-3 font-medium">{localizedName(locale, p)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.qty)}</td>
            <td className="px-4 py-3 text-ink-muted">{unitLabel(ka, p.unit)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
              {formatGEL(p.pricePerUnit, true)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{formatGEL(p.totalPrice)}</td>
          </tr>
        ))}
        {items.length === 0 && <EmptyRow colSpan={5} text={emptyText} />}
      </tbody>
      <SubtotalFoot show={items.length > 0} label={ka.summary.subtotal} value={subtotal} />
    </table>
  );
}
