import Link from 'next/link';
import { hrefWith } from '@/lib/admin/list';
import { pickLocalizedName, localizedName } from '@/lib/i18n/labels';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { Category, Store } from '@/lib/db/schema';
import { CategoryIcon } from '@/components/admin/CategoryIcon';
import { cn } from '@/lib/utils';

export interface CatalogFilterState {
  raw: Record<string, string>;
  category: string;
  store: string;
  hasFilters: boolean;
}

/** A category of the sidebar's tree, with how many products its whole subtree holds. */
export interface SidebarNode {
  category: Category;
  count: number;
  children: SidebarNode[];
}

const PATH = '/catalog';

/**
 * The catalogue's index column: the category tree — each top group with its categories,
 * the deeper levels opening along the path the visitor is on — every category with its
 * icon and the count of its whole subtree, and the partner stores below. Every control is a
 * link, so a filtered view is a URL and nothing here needs JavaScript (the icons are drawn on
 * the server). Search, style and price live in the toolbar above the grid.
 */
export function CatalogSidebar({
  t,
  locale,
  tree,
  total,
  activePath,
  stores,
  state,
}: {
  t: Dictionary;
  locale: Locale;
  tree: SidebarNode[];
  total: number;
  /** The open category and the ones above it, top first. */
  activePath: number[];
  stores: Store[];
  state: CatalogFilterState;
}) {
  const href = (patch: Record<string, string | undefined>) => hrefWith(PATH, state.raw, { ...patch, page: undefined });
  const name = (c: Category) => pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu);

  // A top group's categories are always listed; below that a category opens when it is on the path.
  const branch = (nodes: SidebarNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const active = state.category === node.category.slug;
      const open = activePath.includes(node.category.id);
      return (
        <li key={node.category.id}>
          <CategoryLink href={href({ category: node.category.slug })} active={active} onPath={!active && activePath.includes(node.category.id)} depth={depth} icon={node.category.icon} label={name(node.category)} count={node.count} />
          {open && node.children.length > 0 && <ul>{branch(node.children, depth + 1)}</ul>}
        </li>
      );
    });

  return (
    <div className="space-y-8 text-sm">
      <nav aria-label={t.catalog.filterByCategory}>
        <p className="eyebrow mb-2 px-3">{t.catalog.filterByCategory}</p>
        <ul className="space-y-0.5">
          <li>
            <CategoryLink href={href({ category: undefined })} active={!state.category} depth={0} icon={null} label={t.catalog.allCategories} count={total} />
          </li>
        </ul>
        {tree.map((group) => (
          <div key={group.category.id} className="mt-5">
            <Link
              href={href({ category: group.category.slug })}
              scroll={false}
              aria-current={state.category === group.category.slug ? 'page' : undefined}
              className={cn('mb-1.5 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors', state.category === group.category.slug ? 'text-brand' : 'text-wood-dark/80 hover:text-ink')}
            >
              <CategoryIcon icon={group.category.icon} className="h-3 w-3" />
              <span className="truncate">{name(group.category)}</span>
              <span className="ml-auto tabular-nums">{group.count}</span>
            </Link>
            <ul className="space-y-0.5">{branch(group.children, 1)}</ul>
          </div>
        ))}
      </nav>

      <div>
        <p className="eyebrow mb-2 px-3">{t.catalog.store}</p>
        <ul className="space-y-0.5">
          <FilterLink href={href({ store: undefined })} active={!state.store} label={t.catalog.allStores} />
          {stores.map((s) => (
            <FilterLink key={s.id} href={href({ store: state.store === String(s.id) ? undefined : String(s.id) })} active={state.store === String(s.id)} label={localizedName(locale, s)} />
          ))}
        </ul>
      </div>

      {state.hasFilters && (
        <Link href={PATH} className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink-soft transition-colors hover:border-ink/40 hover:bg-bg-surface hover:text-ink">
          {t.catalog.clearFilters}
        </Link>
      )}
    </div>
  );
}

/** Deeper categories sit further in. */
const INDENT = ['pl-3', 'pl-3', 'pl-7', 'pl-11'];

function CategoryLink({ href, active, onPath = false, depth, icon, label, count }: { href: string; active: boolean; onPath?: boolean; depth: number; icon: string | null; label: string; count: number }) {
  return (
    <div>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? 'page' : undefined}
        className={cn('relative flex items-center justify-between gap-3 rounded-full py-2 pr-3 transition-colors', INDENT[depth] ?? INDENT[INDENT.length - 1], active ? 'bg-sand font-medium text-ink' : onPath ? 'text-ink hover:bg-sand/50' : 'text-ink-soft hover:bg-sand/50 hover:text-ink', depth > 1 && 'py-1.5 text-[13px]')}
      >
        <span className={cn('absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full', active ? 'bg-brand' : 'bg-transparent')} />
        <span className="flex min-w-0 items-center gap-2">
          {icon && <CategoryIcon icon={icon} className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-brand' : 'text-wood')} />}
          <span className="truncate">{label}</span>
        </span>
        <span className={cn('shrink-0 text-xs tabular-nums', active ? 'text-ink-soft' : 'text-ink-faint')}>{count}</span>
      </Link>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <li>
      <Link href={href} scroll={false} data-active={active || undefined} className={cn('flex items-center gap-2.5 rounded-full py-2 pl-3 pr-3 transition-colors', active ? 'bg-sand font-medium text-ink' : 'text-ink-soft hover:bg-sand/50 hover:text-ink')}>
        <span className={cn('grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border', active ? 'border-brand bg-brand' : 'border-stone bg-bg-surface')}>{active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}
