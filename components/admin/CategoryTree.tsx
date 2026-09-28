'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Loader2, Package, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NodeIcon } from '@/components/ui/node-icon';
import type { IconNode } from '@/lib/admin/icons';
import { MAX_CATEGORY_DEPTH } from '@/lib/catalog/tree';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { storedValue } from '@/lib/admin/storageStore';
import { cn } from '@/lib/utils';

/**
 * The whole tree's folds, kept in the browser: opening a category to edit it and coming back —
 * by the breadcrumbs, the tabs, a save — finds the tree folded as it was left. Null until the
 * person first folds or unfolds anything.
 */
const foldStore = storedValue<number[] | null>('local', 'renovate-admin-category-tree', (raw) => (Array.isArray(raw) ? raw.filter((x): x is number => typeof x === 'number') : null), null);

/** A category as the tree page shows it: what the server read, already in reading order. */
export interface CategoryTreeRow {
  id: number;
  parentId: number | null;
  depth: number;
  name: string;
  slug: string;
  icon: IconNode | null;
  isVisible: boolean;
  inCalculator: boolean;
  isFurniture: boolean;
  kindLabel: string | null;
  /** Products filed in this category itself, and in its whole subtree. */
  own: number;
  total: number;
  rooms: Array<{ id: number; name: string }>;
  hasChildren: boolean;
  /** It answers the search or the filter (its ancestors are listed for context). */
  match: boolean;
}

/**
 * The category tree on `/admin/categories`: each category under its parent, folded and
 * unfolded, with its icon, what it holds, where it shows (catalogue, calculator, studio
 * rooms) and its buttons — reorder among its siblings, add a subcategory, edit. Rows arrive in
 * reading order from the server; this only folds them and moves them.
 */
export function CategoryTree({ rows, filtered }: { rows: CategoryTreeRow[]; /** A search or filter is on: everything that answers is unfolded. */ filtered: boolean }) {
  const t = useT();
  const c = t.admin.catTree;
  const router = useRouter();
  // The whole tree unfolds as it was left (the first time, down to the second level). A search
  // unfolds everything it found, and its folds are its own: the page gives each search a new
  // tree, and clearing it brings back the folds that were kept.
  const kept = useSyncExternalStore(foldStore.subscribe, foldStore.get, () => foldStore.fallback);
  const [searchOpen, setSearchOpen] = useState<Set<number>>(() => new Set(rows.filter((r) => r.hasChildren).map((r) => r.id)));
  const open = useMemo(() => (filtered ? searchOpen : new Set(kept ?? rows.filter((r) => r.depth < 2).map((r) => r.id))), [filtered, searchOpen, kept, rows]);
  const setOpen = (next: Set<number>) => (filtered ? setSearchOpen(next) : foldStore.set([...next]));
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const visible = rows.filter((r) => {
    for (let at = r.parentId; at != null; at = byId.get(at)?.parentId ?? null) if (!open.has(at)) return false;
    return true;
  });
  const siblingsOf = (r: CategoryTreeRow) => rows.filter((x) => x.parentId === r.parentId);

  const toggle = (id: number) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const move = async (row: CategoryTreeRow, by: -1 | 1) => {
    const ids = siblingsOf(row).map((s) => s.id);
    const at = ids.indexOf(row.id);
    const to = at + by;
    if (to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch('/api/categories/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: row.parentId, ids }) });
      const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      if (!res.ok) setError(apiErrorMessage(t, json.error));
      router.refresh();
    } catch {
      setError(t.apiErrors.UNKNOWN);
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return <p className="border border-dashed border-line p-12 text-center text-sm text-ink-muted">{filtered ? t.admin.filters.noResults : c.empty}</p>;

  return (
    <div className="border border-line bg-bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="text-xs text-ink-muted">{c.orderHint}</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(new Set(rows.filter((r) => r.hasChildren).map((r) => r.id)))}>
            <ChevronsUpDown className="h-3.5 w-3.5" /> {c.expandAll}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(new Set())}>
            <ChevronsDownUp className="h-3.5 w-3.5" /> {c.collapseAll}
          </Button>
        </div>
      </div>
      {error && <p className="border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</p>}
      <ul>
        {visible.map((row) => {
          const siblings = siblingsOf(row);
          const index = siblings.findIndex((s) => s.id === row.id);
          return (
            <li key={row.id} className={cn('flex items-center gap-3 border-b border-line/70 py-2 pr-3 last:border-b-0', !row.match && 'opacity-60', row.depth === 1 && 'bg-bg-base/60')}>
              <div className={cn('flex min-w-0 flex-1 items-center gap-2', DEPTH_INDENT[row.depth] ?? DEPTH_INDENT[DEPTH_INDENT.length - 1])}>
                {row.hasChildren ? (
                  <button type="button" onClick={() => toggle(row.id)} aria-expanded={open.has(row.id)} aria-label={open.has(row.id) ? c.collapse : c.expand} className="grid h-6 w-6 shrink-0 place-items-center text-ink-muted hover:text-ink">
                    {open.has(row.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="h-6 w-6 shrink-0" />
                )}
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center border', row.depth === 1 ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft')}>{row.icon ? <NodeIcon node={row.icon} className="h-4 w-4" /> : <Package className="h-4 w-4 opacity-40" />}</span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <Link href={`/admin/categories/${row.id}`} className={cn('truncate hover:text-brand', row.depth === 1 ? 'font-semibold text-ink' : 'font-medium text-ink')}>
                      {row.name}
                    </Link>
                    <span className="truncate font-mono text-[11px] text-ink-muted">{row.slug}</span>
                  </div>
                  {/* Where it shows, under its name so the row keeps its buttons on the right. */}
                  {(!row.isVisible || row.inCalculator || row.kindLabel || row.rooms.length > 0) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {!row.isVisible && <Badge tone="muted">{c.badgeHidden}</Badge>}
                      {row.inCalculator && <Badge tone="ink">{c.badgeCalculator}</Badge>}
                      {row.kindLabel && <Badge tone="line">{fill(c.badgeKind, { kind: row.kindLabel })}</Badge>}
                      {row.rooms.slice(0, 4).map((r) => (
                        <Link key={r.id} href={`/admin/categories/rooms/${r.id}`} className="border border-brand/30 bg-brand/5 px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:border-brand">
                          {r.name}
                        </Link>
                      ))}
                      {row.rooms.length > 4 && <Badge tone="line">+{row.rooms.length - 4}</Badge>}
                    </div>
                  )}
                </div>
              </div>

              <Link href={`/admin/products?category=${row.id}`} className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted hover:text-brand" title={fill(c.countsTitle, { own: row.own, total: row.total })}>
                <span className="font-semibold text-ink">{row.total}</span>
                {row.hasChildren && row.own > 0 && <span> · {fill(c.ownShort, { n: row.own })}</span>}
              </Link>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index <= 0 || busy != null} onClick={() => move(row, -1)} aria-label={c.moveUp} title={c.moveUp}>
                  {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index < 0 || index >= siblings.length - 1 || busy != null} onClick={() => move(row, 1)} aria-label={c.moveDown} title={c.moveDown}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                {row.depth < MAX_CATEGORY_DEPTH ? (
                  <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0" title={c.addSub}>
                    <Link href={`/admin/categories/new?parent=${row.id}`} aria-label={c.addSub}>
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <span className="h-7 w-7" />
                )}
                <Button asChild variant="outline" size="sm" className="h-7 w-7 p-0" title={t.admin.actions.edit}>
                  <Link href={`/admin/categories/${row.id}`} aria-label={t.admin.actions.edit}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Each level sits further in. */
const DEPTH_INDENT = ['pl-2', 'pl-2', 'pl-9', 'pl-16'];

function Badge({ tone, children }: { tone: 'ink' | 'line' | 'muted'; children: React.ReactNode }) {
  return <span className={cn('px-1.5 py-0.5 text-[10px] font-semibold', tone === 'ink' ? 'bg-ink text-white' : tone === 'line' ? 'border border-line text-ink-soft' : 'bg-line/60 text-ink-muted')}>{children}</span>;
}
