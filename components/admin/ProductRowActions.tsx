'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

/**
 * A product row's own buttons: edit, hide or show it (the catalogue and the studio drop a hidden
 * product at once), delete it with its files — the last only for whoever may (`canDeleteProduct`:
 * admin, or a store for its own; a catalogue agent hides instead). Server lists drop this into
 * their last column.
 */
export function ProductRowActions({ id, isActive, editHref, canDelete = false }: { id: number; isActive: boolean; editHref: string; canDelete?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (kind: 'toggle' | 'delete') => {
    if (kind === 'delete' && !window.confirm(t.bulk.deleteOneConfirm)) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/products/${id}`, kind === 'delete' ? { method: 'DELETE' } : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) });
      const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      if (!res.ok) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      router.refresh();
    } catch {
      setError(t.apiErrors.UNKNOWN);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {error && <span className="mr-2 text-xs text-danger">{error}</span>}
      <Button asChild variant="outline" size="sm">
        <Link href={editHref} aria-label={t.admin.actions.edit} title={t.admin.actions.edit}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => call('toggle')} disabled={busy != null} aria-label={isActive ? t.bulk.hide : t.bulk.show} title={isActive ? t.bulk.hide : t.bulk.show}>
        {busy === 'toggle' ? <Loader2 className="h-4 w-4 animate-spin" /> : isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      {canDelete && (
        <Button type="button" variant="outline" size="sm" className="text-danger hover:border-danger/60" onClick={() => call('delete')} disabled={busy != null} aria-label={t.bulk.delete} title={t.bulk.delete}>
          {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
