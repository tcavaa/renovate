'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDown, ArrowUp, EyeOff, Loader2, Package, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NodeIcon } from '@/components/ui/node-icon';
import type { IconNode } from '@/lib/admin/icons';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

export interface ShelfRoomRow {
  id: number;
  name: string;
  icon: IconNode | null;
  isVisible: boolean;
  roomTypes: string[];
  categories: Array<{ id: number; name: string; icon: IconNode | null }>;
  products: number;
}

/**
 * The studio's rooms in the order the shelf shows them, each with its categories, the plan's
 * room types it opens for and what it holds — reordered with the arrows.
 */
export function ShelfRoomList({ rows }: { rows: ShelfRoomRow[] }) {
  const t = useT();
  const s = t.admin.shelfRooms;
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const move = async (index: number, by: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    setBusy(rows[index].id);
    setError(null);
    try {
      const res = await fetch('/api/shelf-rooms/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      if (!res.ok) setError(apiErrorMessage(t, json.error));
      router.refresh();
    } catch {
      setError(t.apiErrors.UNKNOWN);
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return <p className="border border-dashed border-line p-12 text-center text-sm text-ink-muted">{s.empty}</p>;

  return (
    <div className="border border-line bg-bg-surface">
      {error && <p className="border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</p>}
      <ul>
        {rows.map((row, i) => (
          <li key={row.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 px-4 py-3 last:border-b-0', !row.isVisible && 'opacity-60')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center border border-ink bg-ink text-white">{row.icon ? <NodeIcon node={row.icon} className="h-5 w-5" /> : <Package className="h-5 w-5 opacity-50" />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/categories/rooms/${row.id}`} className="font-semibold text-ink hover:text-brand">
                  {row.name}
                </Link>
                {!row.isVisible && (
                  <span className="inline-flex items-center gap-1 bg-line/60 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
                    <EyeOff className="h-3 w-3" /> {s.hiddenBadge}
                  </span>
                )}
                {row.roomTypes.map((type) => (
                  <span key={type} className="border border-line px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                    {type}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {row.categories.length === 0 && <span className="text-xs text-ink-muted">{s.noCategories}</span>}
                {row.categories.map((c) => (
                  <Link key={c.id} href={`/admin/categories/${c.id}`} title={c.name} className="inline-flex items-center gap-1 border border-line bg-bg-base px-1.5 py-0.5 text-[11px] text-ink-soft hover:border-ink hover:text-ink">
                    {c.icon ? <NodeIcon node={c.icon} className="h-3 w-3" /> : null}
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
            <p className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted">{fill(s.products, { n: row.products })}</p>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0 || busy != null} onClick={() => move(i, -1)} aria-label={t.admin.catTree.moveUp} title={t.admin.catTree.moveUp}>
                {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === rows.length - 1 || busy != null} onClick={() => move(i, 1)} aria-label={t.admin.catTree.moveDown} title={t.admin.catTree.moveDown}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button asChild variant="outline" size="sm" className="h-7 w-7 p-0" title={t.admin.actions.edit}>
                <Link href={`/admin/categories/rooms/${row.id}`} aria-label={t.admin.actions.edit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
