'use client';

/**
 * The person's own furniture uploads on their profile: what each is, whether its model is
 * there or still waited for, and the way to remove one. Adding is done in the studio, where
 * the piece is wanted; this list is for looking after them.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Box, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { archetypeLabel } from '@/lib/design/catalog';
import { useLocale, useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export interface OwnModelRow {
  id: number;
  name: string;
  kind: string | null;
  imageUrl: string | null;
  status: 'none' | 'pending' | 'ready' | 'failed';
}

export function MyModels({ models }: { models: OwnModelRow[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  /** The one whose removal is being confirmed, or is under way. */
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/design/models/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as { error: string | null };
      if (!res.ok || json.error) throw new Error(json.error ?? 'failed');
      setAsking(null);
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(t.profile.deleteModelFailed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          {t.profile.myModels} <span className="ml-2 text-base font-normal tabular-nums text-ink-muted">{models.length}</span>
        </h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/design/studio">
            <Plus className="h-4 w-4" />
            {t.profile.addModel}
          </Link>
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t.profile.myModelsHint}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {models.length === 0 ? (
        <p className="mt-6 border border-dashed border-line p-8 text-center text-sm text-ink-muted">{t.profile.noModels}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {models.map((m) => {
            const pending = m.status !== 'ready';
            return (
              <li key={m.id} className="flex items-center gap-4 py-3">
                <span className="relative block h-14 w-14 shrink-0 overflow-hidden border border-line bg-bg-base">
                  {m.imageUrl ? <Image src={m.imageUrl} alt="" fill sizes="56px" unoptimized className="object-cover" /> : <Box className="absolute inset-0 m-auto h-5 w-5 text-ink-faint" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {m.kind ? archetypeLabel(m.kind, locale) : '—'}
                    <span className={cn('ml-2 rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold', pending ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success')}>{pending ? t.profile.modelPending : t.profile.modelReady}</span>
                  </p>
                </div>
                {asking === m.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{t.profile.deleteModelConfirm}</span>
                    <Button type="button" size="sm" variant="ink" onClick={() => remove(m.id)} disabled={busy === m.id}>
                      {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      {t.common.delete}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAsking(null)} disabled={busy === m.id}>
                      {t.common.cancel}
                    </Button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAsking(m.id)} aria-label={t.profile.deleteModel} title={t.profile.deleteModel} className="grid h-9 w-9 shrink-0 place-items-center text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
