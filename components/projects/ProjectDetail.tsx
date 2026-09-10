import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Figure } from '@/components/calculator/MaterialsTable';
import { PlanSketch } from '@/components/projects/PlanSketch';
import { MoneyRow } from '@/components/ui/money-row';
import type { Project } from '@/lib/db/schema';
import type { Dictionary } from '@/lib/i18n/ka';
import type { Locale } from '@/lib/i18n';
import { formatM2L, homeStateLabel, roomTypeLabel, materialLabel, workTypeLabel, unitLabel, statusLabel, localizedName } from '@/lib/i18n/labels';
import { formatGEL, formatNumber, cn } from '@/lib/utils';
import type { ProjectSummary, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan, SceneProduct } from '@/lib/design/types';
import { projectKind } from '@/lib/projects/saved';
import { ProjectKindTags } from '@/components/projects/ProjectKindTags';

/**
 * A saved project, in full: meta, the layout, the rooms, materials, products, furniture,
 * labour and the cost breakdown — as an editorial spread of hairline ledgers.
 *
 * Rendered identically for the owner (`/profile/projects/[id]`) and for admin
 * (`/admin/projects/[id]`); only the back link, the actions and any extra meta rows differ.
 * Server component — the caller loads the project and prices it with the current rate book.
 */
export interface MetaItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

export function dateLocaleFor(locale: Locale): string {
  return locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
}

const TH = 'px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted';
const TD = 'px-4 py-2.5 align-top';

export function ProjectDetail({
  project,
  summary,
  t,
  locale,
  backHref,
  backLabel,
  extraMeta = [],
  actions,
  after,
}: {
  project: Project;
  summary: ProjectSummary;
  t: Dictionary;
  locale: Locale;
  backHref: string;
  backLabel: string;
  extraMeta?: MetaItem[];
  /** Buttons on the right of the head — the owner gets "open in 3D". */
  actions?: React.ReactNode;
  /** Rendered under the breakdown — the orders placed against the project. */
  after?: React.ReactNode;
}) {
  const rooms = summary.rooms as Room[];
  const plan = (project.plan as FloorPlan | null) ?? null;
  const kind = projectKind(project);
  const isDesign = kind.hasDesign;
  const kindLabel = [kind.hasCalculator ? t.profile.typeCalculator : null, kind.hasDesign ? t.profile.typeDesign : null].filter(Boolean).join(' + ') || t.profile.typeCalculator;
  const scene = (project.scene as DesignScene | null) ?? null;
  const design = scene ? designLines(scene, plan, t) : null;
  const facts: Array<{ label: string; value: string }> = [
    { label: 'ID', value: `#${project.id}` },
    { label: t.profile.colType, value: kindLabel },
    { label: t.profile.metaCreated, value: new Date(project.createdAt).toLocaleString(dateLocaleFor(locale)) },
    { label: t.summary.homeState, value: homeStateLabel(t, project.homeState) },
    ...extraMeta.map((m) => ({ label: m.label, value: m.value })),
  ];

  return (
    <div className="py-4 md:py-8">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <header className="mt-4 flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectKindTags t={t} kind={kind} />
            <span className={cn('border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', project.status === 'saved' ? 'border-success/50 text-success' : 'border-line text-ink-muted')}>{statusLabel(t, project.status ?? 'draft')}</span>
          </div>
          <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-[2.75rem]">
            {project.nameKa ?? t.profile.fallbackName} <span className="text-ink-faint">#{project.id}</span>
          </h1>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>

      <dl className="mt-6 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="border-b border-r border-line px-4 py-3">
            <dt className="eyebrow">{f.label}</dt>
            <dd className="mt-1 truncate text-sm font-medium text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t.summary.materials} value={formatGEL(summary.subtotalMaterials + summary.subtotalProducts)} />
        <Figure label={t.summary.furniture} value={formatGEL(summary.subtotalFurniture)} />
        <Figure label={t.summary.workers} value={formatGEL(summary.subtotalWorkers)} />
        {design && design.total > 0 ? <Figure label={t.profile.designTotal} value={formatGEL(design.total)} emphasis /> : <Figure label={t.summary.grandTotalWithMargin} value={formatGEL(summary.grandTotalWithMargin)} emphasis />}
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Section title={t.calculator.layoutTitle} count={rooms.length}>
          {rooms.length > 0 || plan ? (
            <div className="border border-line bg-white p-4">
              <PlanSketch plan={plan} rooms={rooms} className="block h-auto w-full" />
            </div>
          ) : (
            <p className="border border-dashed border-line p-10 text-center text-sm text-ink-muted">{t.profile.layoutEmpty}</p>
          )}
        </Section>

        <Section title={t.summary.rooms} count={rooms.length} aside={<span className="font-serif text-lg font-semibold text-ink">{formatM2L(t, Number(project.totalM2))}</span>}>
          {rooms.length === 0 ? (
            <p className="border border-dashed border-line p-10 text-center text-sm text-ink-muted">{t.summary.roomsEmpty}</p>
          ) : (
            <ul className="border border-line bg-bg-surface">
              {rooms.map((r, i) => (
                <li key={r.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className="text-xs tabular-nums text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-semibold text-ink">
                      {r.nameKa}
                      {r.isWetRoom && <span className="ml-2 border border-line px-1 py-px text-[10px] font-medium uppercase tracking-wide text-ink-muted">{t.rooms.wet}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {roomTypeLabel(t, r.type)}
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <span className="tabular-nums">
                        {r.width} × {r.length} × {r.height} {t.units.m}
                      </span>
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <span className="tabular-nums">
                        {t.rooms.wallsLabel} {formatM2L(t, r.wallM2)}
                      </span>
                    </p>
                  </div>
                  <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatM2L(t, r.floorM2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-12 space-y-12">
        <Section title={t.summary.materials} count={summary.materials.length}>
          <Table
            head={[t.summary.item, t.summary.qty, t.summary.unit, t.summary.unitPrice, t.calculator.total]}
            rows={summary.materials.map((m) => {
              const total = m.estimatedPriceGEL ? m.qty * m.estimatedPriceGEL : 0;
              return [materialLabel(t, m.key), formatNumber(m.qty), unitLabel(t, m.unit), m.estimatedPriceGEL ? formatGEL(m.estimatedPriceGEL, true) : '—', total > 0 ? formatGEL(total) : '—'];
            })}
            empty={t.summary.materialsEmpty}
            subtotal={summary.materials.length ? { label: t.summary.subtotal, value: summary.subtotalMaterials } : undefined}
          />
        </Section>

        <Section title={t.summary.products} count={summary.products.length}>
          <ProductsTable items={summary.products} subtotal={summary.subtotalProducts} emptyText={t.summary.productsEmpty} t={t} locale={locale} rooms={rooms} />
        </Section>

        <Section title={t.summary.furniture} count={summary.furniture.length}>
          <ProductsTable items={summary.furniture} subtotal={summary.subtotalFurniture} emptyText={design && design.groups.length > 0 ? t.profile.furnitureInStudio : t.summary.furnitureEmpty} t={t} locale={locale} />
        </Section>

        {design && design.groups.length > 0 && (
          <Section title={t.profile.designProducts} count={design.count} aside={<span className="font-serif text-lg font-semibold text-ink">{formatGEL(design.total)}</span>}>
            <p className="text-sm text-ink-muted">{t.profile.designProductsHint}</p>
            <div className="space-y-6">
              {design.groups.map((group) => (
                <div key={group.storeKey} className="space-y-2">
                  <p className="eyebrow">{group.storeName}</p>
                  <Table
                    head={[t.summary.item, t.summary.qty, t.summary.unit, t.summary.unitPrice, t.calculator.total]}
                    rows={group.lines.map((l) => [`${localizedName(locale, l.product)}${l.where ? ` · ${l.where}` : ''}`, formatNumber(l.product.qty), unitLabel(t, l.product.unit), formatGEL(l.product.pricePerUnit, true), formatGEL(l.product.totalPrice)])}
                    empty=""
                    subtotal={{ label: t.summary.subtotal, value: group.subtotal }}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={t.summary.workers} count={summary.workerCosts.length}>
          <Table
            head={[t.summary.item, t.summary.qty, t.summary.unit, t.summary.unitPrice, t.calculator.total]}
            rows={summary.workerCosts.map((w) => [workTypeLabel(t, w.key), formatNumber(w.qty), unitLabel(t, w.qtyUnit), formatGEL(w.pricePerQty, true), formatGEL(w.totalGEL)])}
            empty={t.summary.workEmpty}
            subtotal={summary.workerCosts.length ? { label: t.summary.subtotal, value: summary.subtotalWorkers } : undefined}
          />
        </Section>

        <Section title={t.summary.breakdown}>
          <div className="max-w-xl border border-line bg-bg-surface p-5 md:p-6">
            <div className="space-y-2">
              <MoneyRow label={t.summary.materials} value={summary.subtotalMaterials + summary.subtotalProducts} />
              <MoneyRow label={t.summary.furniture} value={summary.subtotalFurniture} />
              <MoneyRow label={t.summary.workers} value={summary.subtotalWorkers} />
            </div>
            <div className="mt-4 space-y-2 border-t border-line pt-4">
              <MoneyRow label={t.summary.grandTotal} value={summary.grandTotal} bold />
              <MoneyRow label={t.summary.contingency} value={summary.grandTotalWithMargin - summary.grandTotal} muted />
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-4">
              <span className="font-serif text-lg font-semibold text-ink">{t.summary.grandTotalWithMargin}</span>
              <span className="font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(summary.grandTotalWithMargin)}</span>
            </div>
          </div>
        </Section>
      </div>

      {after}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ title, count, aside, children }: { title: string; count?: number; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
        {aside ?? (count !== undefined && <span className="text-sm tabular-nums text-ink-muted">{count}</span>)}
      </div>
      {children}
    </section>
  );
}

function Table({ head, rows, empty, subtotal }: { head: string[]; rows: string[][]; empty: string; subtotal?: { label: string; value: number } }) {
  if (rows.length === 0) return <p className="border border-dashed border-line p-10 text-center text-sm text-ink-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto border border-line bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={h} className={cn(TH, i > 0 && i !== 2 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-b-0">
              {r.map((c, j) => (
                <td key={j} className={cn(TD, j === 0 ? 'font-medium text-ink' : j === 2 ? 'text-ink-muted' : 'text-right tabular-nums', j === 3 && 'text-ink-muted', j === 4 && 'font-medium')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {subtotal && (
          <tfoot className="border-t-2 border-ink">
            <tr>
              <td colSpan={head.length - 1} className="px-4 py-3 text-right text-sm font-semibold text-ink">
                {subtotal.label}
              </td>
              <td className="px-4 py-3 text-right font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(subtotal.value)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
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

export function ProductsTable({ items, subtotal, emptyText, t, locale, rooms = [] }: { items: SelectedProduct[]; subtotal: number; emptyText: string; t: Dictionary; locale: Locale; rooms?: Pick<Room, 'id' | 'nameKa'>[] }) {
  const roomName = new Map(rooms.map((r) => [r.id, r.nameKa]));
  return (
    <Table
      head={[t.summary.item, t.summary.qty, t.summary.unit, t.summary.unitPrice, t.calculator.total]}
      rows={items.map((p) => [`${localizedName(locale, p)}${p.roomId && roomName.get(p.roomId) ? ` · ${roomName.get(p.roomId)}` : ''}`, formatNumber(p.qty), unitLabel(t, p.unit), formatGEL(p.pricePerUnit, true), formatGEL(p.totalPrice)])}
      empty={emptyText}
      subtotal={items.length ? { label: t.summary.subtotal, value: subtotal } : undefined}
    />
  );
}

/**
 * The studio's products, grouped by the store that sells them: every placed item with a
 * product and every chosen finish, each with the room (and surface) it belongs to. The
 * store snapshots travel with the scene, so this needs no catalogue lookup.
 */
function designLines(scene: DesignScene, plan: FloorPlan | null, t: Dictionary) {
  const roomName = new Map((plan?.rooms ?? []).map((r) => [r.id, r.name]));
  const groups = new Map<string, { storeKey: string; storeName: string; lines: Array<{ product: SceneProduct; where: string | null }>; subtotal: number }>();
  const push = (product: SceneProduct, where: string | null) => {
    const key = product.store ? String(product.store.id) : 'none';
    const group = groups.get(key) ?? { storeKey: key, storeName: product.store?.nameKa ?? '—', lines: [], subtotal: 0 };
    group.lines.push({ product, where });
    group.subtotal += product.totalPrice;
    groups.set(key, group);
  };
  for (const item of scene.items) if (item.product) push(item.product, roomName.get(item.roomId) ?? null);
  for (const finish of scene.finishes) {
    if (!finish.product) continue;
    const surface = finish.surface === 'floor' ? t.design.finishFloor : finish.surface === 'wall' ? t.design.finishWall : t.design.finishCeiling;
    push(finish.product, [roomName.get(finish.roomId), surface].filter(Boolean).join(' · ') || null);
  }
  const list = [...groups.values()].sort((a, b) => b.subtotal - a.subtotal);
  return { groups: list, count: list.reduce((n, g) => n + g.lines.length, 0), total: list.reduce((n, g) => n + g.subtotal, 0) };
}
