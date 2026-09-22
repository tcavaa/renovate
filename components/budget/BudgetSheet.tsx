'use client';

/**
 * The sheet both summaries are read and edited on — the calculator's and the design's.
 *
 * One list, shown once. Everything a shop sells stands under that shop, because that is who
 * is asked for it and what its delivery is charged on; what nobody sells — the bulk
 * materials, the labour, the estimates for things not chosen yet — stays under its kind.
 * (The first version listed the products twice, by kind with the ticks and again by shop
 * without them, and the two had to be read against each other.)
 *
 * Every line can be ticked out of the order and have its quantity changed; a whole shop or a
 * whole kind goes in or out at the box at its head. Nothing edited is lost from view: a line
 * ticked off stays where it stood, struck through, and a changed quantity keeps the figure
 * that was worked out beside it.
 */

import Image from 'next/image';
import { useState } from 'react';
import { MapPin, Pencil, Phone, Truck } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { quantityOptions } from '@/lib/summary/quantity';
import { cn, formatGEL, formatNumber, formatUnit } from '@/lib/utils';
import type { BudgetLine, BudgetSection } from '@/lib/design/pricing';
import type { SceneStore } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';
import { budgetLineName } from './lineName';
import { ProductPageLink } from '@/components/design/ProductPageLink';

export const SECTION_ORDER: BudgetSection[] = ['finishes', 'products', 'openings', 'furniture', 'lighting', 'electrical', 'plumbing', 'heating', 'climate', 'materials', 'labour', 'delivery'];
export const SECTION_KEY: Record<BudgetSection, keyof Dictionary['build']> = {
  furniture: 'secFurniture',
  lighting: 'secLighting',
  finishes: 'secFinishes',
  products: 'secProducts',
  openings: 'secOpenings',
  electrical: 'secElectrical',
  plumbing: 'secPlumbing',
  heating: 'secHeating',
  climate: 'secClimate',
  materials: 'secMaterials',
  labour: 'secLabour',
  delivery: 'secDelivery',
};

export interface SheetActions {
  /** One line in or out of the order. */
  toggle: (line: BudgetLine) => void;
  /** A whole shop's lines, or a whole kind's, in or out together. */
  setMany: (lines: BudgetLine[], excluded: boolean) => void;
  /** One line's quantity; `null` goes back to what the sheet worked out. */
  setQuantity: (line: BudgetLine, qty: number | null) => void;
}

interface SheetProps {
  lines: BudgetLine[];
  /** Absent on a sheet that is only read — a saved project, a printed page. */
  actions?: SheetActions;
  /** The build-mode corners of the design flow; the calculator's pages are square. */
  rounded?: boolean;
}

/** The product id a line's key names, for scenes saved when ticks were per product. */
const legacyProductId = (line: BudgetLine): number | null => line.product?.productId ?? null;

export function BudgetSheet({ lines, actions, rounded = false }: SheetProps) {
  const t = useT();

  // A shop's lines stand under the shop, in the order the shops first appear on the sheet —
  // never by subtotal, which would reshuffle the page every time a box was ticked.
  const stores: Array<{ store: SceneStore; lines: BudgetLine[] }> = [];
  const rest: BudgetLine[] = [];
  for (const line of lines) {
    if (line.section === 'delivery') continue;
    const store = line.product?.store;
    if (!store) {
      rest.push(line);
      continue;
    }
    let group = stores.find((g) => g.store.id === store.id);
    if (!group) {
      group = { store, lines: [] };
      stores.push(group);
    }
    group.lines.push(line);
  }
  const deliveryOf = (storeId: number): number | null => lines.find((l) => l.section === 'delivery' && l.key === `delivery-${storeId}`)?.total ?? null;

  return (
    <div className="space-y-5">
      {stores.length > 0 && <p className="eyebrow">{t.build.byStoreHint}</p>}
      {stores.map((group) => (
        <StoreCard key={group.store.id} store={group.store} lines={group.lines} delivery={deliveryOf(group.store.id)} actions={actions} rounded={rounded} />
      ))}

      {rest.length > 0 && stores.length > 0 && <p className="eyebrow pt-2">{t.build.otherLinesHint}</p>}
      {SECTION_ORDER.map((section) => {
        const own = rest.filter((l) => l.section === section);
        if (own.length === 0) return null;
        return <SectionCard key={section} title={t.build[SECTION_KEY[section]]} lines={own} actions={actions} rounded={rounded} />;
      })}
    </div>
  );
}

/** What is still counted of a group of lines. */
const counted = (lines: BudgetLine[]): number => Math.round(lines.reduce((s, l) => s + (l.excluded ? 0 : l.total), 0) * 100) / 100;

function StoreCard({ store, lines, delivery, actions, rounded }: { store: SceneStore; lines: BudgetLine[]; delivery: number | null; actions?: SheetActions; rounded: boolean }) {
  const t = useT();
  const locale = useLocale();
  const subtotal = counted(lines);
  const anyIn = lines.some((l) => !l.excluded);
  return (
    <section className={cn('overflow-hidden border border-line bg-bg-surface', rounded && 'rounded-[16px]')}>
      <header className="flex items-center gap-4 border-b border-line p-4">
        {store.logoUrl ? (
          <Image src={store.logoUrl} alt={localizedName(locale, store)} width={40} height={40} className={cn('border border-line', rounded && 'rounded-[8px]')} />
        ) : (
          <span className={cn('grid h-10 w-10 shrink-0 place-items-center border border-line font-serif text-base font-semibold text-ink', rounded && 'rounded-[8px]')}>{localizedName(locale, store).slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-lg font-semibold text-ink">{localizedName(locale, store)}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {store.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {store.address}
              </span>
            )}
            {store.phone && (
              <a href={`tel:${store.phone}`} className="flex items-center gap-1 hover:text-ink">
                <Phone className="h-3 w-3" />
                {store.phone}
              </a>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(subtotal)}</p>
          <p className="flex items-center justify-end gap-1 text-[11px] text-ink-muted">
            <Truck className="h-3 w-3" />
            {!anyIn ? '—' : delivery == null || delivery === 0 ? t.design.freeDelivery : formatGEL(delivery)}
          </p>
        </div>
      </header>
      <LinesTable lines={lines} actions={actions} allLabel={t.build.storeAll} showItem />
    </section>
  );
}

function SectionCard({ title, lines, actions, rounded }: { title: string; lines: BudgetLine[]; actions?: SheetActions; rounded: boolean }) {
  const t = useT();
  return (
    <section className={cn('overflow-hidden border border-line bg-bg-surface', rounded && 'rounded-[16px]')}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
        <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(counted(lines))}</span>
      </header>
      <LinesTable lines={lines} actions={actions} allLabel={t.build.sectionAll} />
    </section>
  );
}

function LinesTable({ lines, actions, allLabel, showItem = false }: { lines: BudgetLine[]; actions?: SheetActions; allLabel: string; showItem?: boolean }) {
  const t = useT();
  const tickable = lines.filter((l) => l.tick != null);
  const out = tickable.filter((l) => l.excluded).length;
  const allIn = out === 0;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
          <th className="px-4 py-2 text-left font-semibold">
            <span className="flex items-center gap-2">
              {actions && tickable.length > 1 && (
                <input
                  type="checkbox"
                  checked={allIn}
                  ref={(el) => {
                    // Some in, some out: the box says so rather than pretending either.
                    if (el) el.indeterminate = out > 0 && out < tickable.length;
                  }}
                  onChange={() => actions.setMany(tickable, allIn)}
                  aria-label={allLabel}
                  title={allLabel}
                  className="no-print accent-ink"
                />
              )}
              {t.build.colItem}
            </span>
          </th>
          <th className="px-2 py-2 text-right font-semibold">{t.build.colQty}</th>
          <th className="px-2 py-2 text-right font-semibold">{t.build.colUnitPrice}</th>
          <th className="px-4 py-2 text-right font-semibold">{t.build.colTotal}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <Row key={line.tick ?? `${line.key}-${i}`} line={line} actions={actions} showItem={showItem} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ line, actions, showItem }: { line: BudgetLine; actions?: SheetActions; showItem: boolean }) {
  const t = useT();
  const off = !!line.excluded;
  const name = budgetLineName(t, line);
  const under = [showItem ? line.item : null, line.roomName].filter(Boolean).join(' · ');
  // A product line shows the product: its photo, and its name as the way to its own page
  // (a new tab, so the sheet stays as it was) — the real photos are there. Snapshots from
  // before the slug travelled with the product get the name and no link.
  const photo = line.product?.imageUrl || null;
  const slug = line.product?.slug || null;
  return (
    <tr className={cn('border-t border-line/70', off && 'text-ink-faint')}>
      <td className="px-4 py-2">
        <div className="flex items-start gap-2">
          {actions && line.tick != null && (
            <input type="checkbox" checked={!off} onChange={() => actions.toggle(line)} aria-label={`${t.build.includeInOrder} — ${name}`} className="no-print mt-0.5 accent-ink" />
          )}
          {photo && (
            <span className={cn('relative block h-8 w-8 shrink-0 overflow-hidden rounded-[4px] border border-line bg-bg-base', off && 'opacity-50')}>
              <Image src={photo} alt={name} fill sizes="32px" className="object-cover" />
            </span>
          )}
          <div className="min-w-0">
            <p className={cn('flex items-center gap-1 font-medium', off ? 'line-through' : 'text-ink')}>
              {slug ? (
                <a href={`/catalog/${slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {name}
                </a>
              ) : (
                <span>{name}</span>
              )}
              {slug && <ProductPageLink slug={slug} size="inline" />}
            </p>
            <p className={cn('text-xs', !off && 'text-ink-muted')}>
              {under}
              {line.estimated && <span className="ml-1.5 rounded-[4px] bg-sand px-1 py-px text-[10px] uppercase tracking-wide text-ink-muted">{t.build.estimated}</span>}
            </p>
          </div>
        </div>
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2 text-right tabular-nums', !off && 'text-ink-soft')}>
        <QuantityCell line={line} onChange={actions && line.tick != null && !off ? (qty) => actions.setQuantity(line, qty) : undefined} />
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2 text-right tabular-nums', !off && 'text-ink-muted')}>{formatGEL(line.unitPrice, line.unitPrice < 10)}</td>
      <td className={cn('whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums', off && 'line-through')}>{formatGEL(line.total)}</td>
    </tr>
  );
}

/**
 * A quantity, and the pencil that changes it. The edit is a choice from a list around the
 * figure that was worked out (`quantityOptions`), not a free field; choosing the worked-out
 * figure again lets go of the edit. While a quantity is the person's own, the one the sheet
 * worked out stands beside it, struck through.
 */
export function QuantityCell({ line, onChange }: { line: BudgetLine; onChange?: (qty: number | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const original = line.originalQty ?? line.qty;
  const unit = formatUnit(line.unit);
  const edited = line.originalQty != null;

  if (open && onChange) {
    return (
      <select
        autoFocus
        value={String(line.qty)}
        onChange={(e) => {
          const value = Number(e.target.value);
          onChange(Math.abs(value - original) < 1e-9 ? null : value);
          setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        aria-label={t.build.qtyEdit}
        className="h-8 max-w-[11rem] border border-ink bg-white px-1.5 text-right text-sm tabular-nums text-ink focus:outline-none"
      >
        {quantityOptions(original, line.unit, line.qty).map((option) => (
          <option key={option.value} value={String(option.value)}>
            {formatNumber(option.value)} {unit}
            {option.original ? ` — ${t.build.qtyOriginal}` : option.percent != null ? ` (${option.percent > 0 ? '+' : ''}${option.percent}%)` : ''}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {edited && (
        <s className="text-xs text-ink-faint" title={fill(t.build.qtyWas, { qty: `${formatNumber(original)} ${unit}` })}>
          {formatNumber(original)}
        </s>
      )}
      <span className={cn(edited && 'font-semibold text-brand')}>
        {formatNumber(line.qty)} {unit}
      </span>
      {onChange && (
        <button type="button" onClick={() => setOpen(true)} aria-label={t.build.qtyEdit} title={t.build.qtyEdit} className="no-print grid h-6 w-6 place-items-center text-ink-faint transition-colors hover:text-ink">
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export { legacyProductId };
