'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

/**
 * Ticking rows of a server-rendered list and acting on them together: the page stays a server
 * component and drops in `BulkCheckbox` per row, `BulkAllCheckbox` in the head and `BulkBar`
 * above the table, all inside one `BulkProvider`. The bar appears once something is ticked and
 * posts the ids to the list's bulk route; the page is refreshed after.
 */
interface BulkState {
  selected: Set<number>;
  toggle: (id: number) => void;
  setMany: (ids: number[], on: boolean) => void;
  clear: () => void;
}

const BulkContext = createContext<BulkState | null>(null);

export function BulkProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setMany = (ids: number[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  return <BulkContext.Provider value={{ selected, toggle, setMany, clear: () => setSelected(new Set()) }}>{children}</BulkContext.Provider>;
}

function useBulk(): BulkState {
  const state = useContext(BulkContext);
  if (!state) throw new Error('BulkCheckbox, BulkAllCheckbox and BulkBar need a BulkProvider');
  return state;
}

export function BulkCheckbox({ id, label }: { id: number; label?: string }) {
  const { selected, toggle } = useBulk();
  return <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={label ?? `#${id}`} className="h-4 w-4 accent-ink" />;
}

export function BulkAllCheckbox({ ids }: { ids: number[] }) {
  const t = useT();
  const { selected, setMany } = useBulk();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return <input type="checkbox" checked={all} onChange={() => setMany(ids, !all)} aria-label={t.bulk.selectAll} title={t.bulk.selectAll} className="h-4 w-4 accent-ink" />;
}

export type BulkAction = 'show' | 'hide' | 'delete';

export function BulkBar({ endpoint, actions = ['show', 'hide', 'delete'], noun }: { endpoint: string; actions?: BulkAction[]; noun?: string }) {
  const t = useT();
  const b = t.bulk;
  const router = useRouter();
  const { selected, clear } = useBulk();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const count = selected.size;

  const run = async (action: BulkAction) => {
    if (action === 'delete' && !window.confirm(fill(b.deleteConfirm, { n: count }))) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], action }) });
      const json = (await res.json()) as { data: { done: number; skipped: number } | null; error: string | null };
      if (!res.ok || !json.data) {
        setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
        return;
      }
      setNotice({ ok: true, text: [fill(b.done, { n: json.data.done }), json.data.skipped > 0 ? fill(b.skipped, { n: json.data.skipped }) : null].filter(Boolean).join(' · ') });
      clear();
      router.refresh();
    } catch {
      setNotice({ ok: false, text: t.apiErrors.UNKNOWN });
    } finally {
      setBusy(false);
    }
  };

  if (count === 0 && !notice) return null;
  return (
    <div className={cn('sticky top-2 z-20 flex flex-wrap items-center gap-2 border px-3 py-2 text-sm', count > 0 ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface')}>
      {count > 0 ? (
        <>
          <span className="font-medium">
            {fill(b.selected, { n: count })}
            {noun ? ` · ${noun}` : ''}
          </span>
          <span className="flex-1" />
          {actions.includes('show') && (
            <Button type="button" size="sm" variant="outline" className="text-ink" onClick={() => run('show')} disabled={busy}>
              <Eye className="h-4 w-4" />
              {b.show}
            </Button>
          )}
          {actions.includes('hide') && (
            <Button type="button" size="sm" variant="outline" className="text-ink" onClick={() => run('hide')} disabled={busy}>
              <EyeOff className="h-4 w-4" />
              {b.hide}
            </Button>
          )}
          {actions.includes('delete') && (
            <Button type="button" size="sm" variant="destructive" onClick={() => run('delete')} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {b.delete}
            </Button>
          )}
          <button type="button" onClick={clear} aria-label={b.clear} title={b.clear} className="grid h-8 w-8 place-items-center text-white/80 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        notice && <p className={notice.ok ? 'text-success' : 'text-danger'}>{notice.text}</p>
      )}
    </div>
  );
}
