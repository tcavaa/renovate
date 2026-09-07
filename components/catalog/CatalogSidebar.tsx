import Link from 'next/link';
import { hrefWith } from '@/lib/admin/list';
import { pickLocalizedName, localizedName } from '@/lib/i18n/labels';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { Category, Store } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

export interface CatalogFilterState {
  raw: Record<string, string>;
  category: string;
  store: string;
  hasFilters: boolean;
}

const PATH = '/catalog';

/**
 * The catalogue's index column. Categories in two groups (materials by renovation phase,
 * then furniture and decor), each with its live count, and the partner stores below. Every
 * control is a link, so a filtered view is a URL and nothing here needs JavaScript. Search,
 * style and price live in the toolbar above the grid.
 */
export function CatalogSidebar({
  t,
  locale,
  categories,
  counts,
  stores,
  state,
}: {
  t: Dictionary;
  locale: Locale;
  categories: Category[];
  counts: Record<number, number>;
  stores: Store[];
  state: CatalogFilterState;
}) {
  const materials = categories.filter((c) => !c.isFurniture);
  const furniture = categories.filter((c) => c.isFurniture);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const href = (patch: Record<string, string | undefined>) => hrefWith(PATH, state.raw, { ...patch, page: undefined });

  return (
    <div className="space-y-8 text-sm">
      <nav aria-label={t.catalog.filterByCategory}>
        <p className="eyebrow mb-2">{t.catalog.filterByCategory}</p>
        <ul className="border-t border-line">
          <CategoryLink href={href({ category: undefined })} active={!state.category} label={t.catalog.allCategories} count={total} />
        </ul>
        <Group label={t.catalog.materialsGroup}>
          {materials.map((c) => (
            <CategoryLink key={c.id} href={href({ category: c.slug })} active={state.category === c.slug} label={pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu)} count={counts[c.id] ?? 0} />
          ))}
        </Group>
        <Group label={t.catalog.furnitureGroup}>
          {furniture.map((c) => (
            <CategoryLink key={c.id} href={href({ category: c.slug })} active={state.category === c.slug} label={pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu)} count={counts[c.id] ?? 0} />
          ))}
        </Group>
      </nav>

      <div>
        <p className="eyebrow mb-2">{t.catalog.store}</p>
        <ul className="border-t border-line">
          <FilterLink href={href({ store: undefined })} active={!state.store} label={t.catalog.allStores} />
          {stores.map((s) => (
            <FilterLink key={s.id} href={href({ store: state.store === String(s.id) ? undefined : String(s.id) })} active={state.store === String(s.id)} label={localizedName(locale, s)} />
          ))}
        </ul>
      </div>

      {state.hasFilters && (
        <Link href={PATH} className="bracket-link inline-block text-sm font-medium text-ink-soft hover:text-ink">
          {t.catalog.clearFilters}
        </Link>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{label}</p>
      <ul className="border-t border-line">{children}</ul>
    </div>
  );
}

function CategoryLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <li className="border-b border-line">
      <Link
        href={href}
        scroll={false}
        aria-current={active ? 'page' : undefined}
        className={cn('relative flex items-center justify-between gap-3 py-2 pl-3 pr-1 transition-colors', active ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink')}
      >
        <span className={cn('absolute inset-y-0 left-0 w-[2px]', active ? 'bg-ink' : 'bg-transparent')} />
        <span className="truncate">{label}</span>
        <span className={cn('shrink-0 text-xs tabular-nums', active ? 'text-ink' : 'text-ink-faint')}>{count}</span>
      </Link>
    </li>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <li className="border-b border-line">
      <Link href={href} scroll={false} data-active={active || undefined} className={cn('flex items-center gap-2.5 py-2 pl-3 pr-1 transition-colors', active ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink')}>
        <span className={cn('grid h-3.5 w-3.5 shrink-0 place-items-center border', active ? 'border-ink bg-ink' : 'border-line')}>{active && <span className="h-1.5 w-1.5 bg-white" />}</span>
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}
