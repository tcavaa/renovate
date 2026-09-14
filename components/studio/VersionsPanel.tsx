'use client';

/**
 * The kept versions of the flat. Version 01 is the existing house and is never lost; the
 * working state is shown as the current version, and "save version" keeps a snapshot with
 * a name. Restoring one keeps the present first, so nothing is thrown away.
 */

import { useState } from 'react';
import { Clock, History, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useDesignStore } from '@/store/designStore';

export function VersionsPanel({ className }: { className?: string }) {
  const t = useT();
  const versions = useDesignStore((s) => s.versions);
  const saveVersion = useDesignStore((s) => s.saveVersion);
  const restoreVersion = useDesignStore((s) => s.restoreVersion);
  const renameVersion = useDesignStore((s) => s.renameVersion);
  const deleteVersion = useDesignStore((s) => s.deleteVersion);
  const [name, setName] = useState('');
  const nextNumber = versions.length + 1;

  const save = () => {
    saveVersion(name.trim() || fill(t.build.versionN, { n: String(nextNumber).padStart(2, '0') }));
    setName('');
  };

  return (
    <div className={cn('flex h-full flex-col gap-3', className)}>
      <p className="text-[11px] leading-snug text-ink-muted">{t.build.versionsHint}</p>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {versions.map((v, i) => (
          <li key={v.id} className="rounded-[12px] border border-line bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {v.kind === 'existing' ? <History className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {String(i + 1).padStart(2, '0')}
                </p>
                <input
                  value={v.name}
                  onChange={(e) => renameVersion(v.id, e.target.value)}
                  aria-label={t.build.versionName}
                  className="mt-0.5 w-full bg-transparent text-sm font-semibold text-ink focus:outline-none"
                />
                <p className="text-[11px] text-ink-muted">{formatDateTime(v.createdAt)}</p>
              </div>
              {v.kind !== 'existing' && (
                <button type="button" onClick={() => deleteVersion(v.id)} aria-label={t.common.delete} className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button type="button" onClick={() => restoreVersion(v.id, t.build.versionBeforeRestore)} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line text-xs font-medium text-ink-soft hover:border-ink hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" />
              {t.build.versionRestore}
            </button>
          </li>
        ))}
        <li className="rounded-[12px] border border-dashed border-ink/40 bg-sand-light/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{String(nextNumber).padStart(2, '0')} · {t.build.versionCurrent}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{versions.some((v) => v.kind === 'existing') ? t.build.versionModified : t.build.versionExisting}</p>
        </li>
      </ul>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={fill(t.build.versionN, { n: String(nextNumber).padStart(2, '0') })} maxLength={120} className="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-white px-2 text-sm" />
        <button type="button" onClick={save} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-ink px-3 text-xs font-semibold text-white hover:bg-brand">
          <Save className="h-3.5 w-3.5" />
          {t.build.saveVersion}
        </button>
      </div>
    </div>
  );
}
