'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';

async function deleteProject(id: number): Promise<string | null> {
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  const json = (await res.json()) as { error: string | null };
  return res.ok ? null : json.error ?? 'UNKNOWN';
}

/** Forgets the deleted row in the browser too, or the next autosave would write into a project that is gone. */
function forgetLocally(ids: number[]) {
  const calc = useCalculatorStore.getState();
  if (calc.projectId != null && ids.includes(calc.projectId)) calc.setProjectId(null);
  const design = useDesignStore.getState();
  if (design.projectId != null && ids.includes(design.projectId)) design.setProjectId(null);
}

/** Deletes one project after a confirmation; the page refreshes itself. */
export function DeleteProjectButton({ projectId, size = 'sm', afterHref }: { projectId: number; size?: 'sm' | 'default'; afterHref?: string }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!confirm(t.profile.deleteProjectConfirm)) return;
    setBusy(true);
    setError(null);
    const failed = await deleteProject(projectId);
    setBusy(false);
    if (failed) {
      setError(apiErrorMessage(t, failed));
      return;
    }
    forgetLocally([projectId]);
    if (afterHref) router.push(afterHref);
    router.refresh();
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size={size} onClick={remove} disabled={busy} className="text-ink-muted hover:text-danger" aria-label={t.profile.deleteProject} title={t.profile.deleteProject}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {size !== 'sm' && t.profile.deleteProject}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Deletes every draft in one go — what the autosave leaves behind when a visit went nowhere. */
export function DeleteDraftsButton({ ids }: { ids: number[] }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (ids.length === 0) return null;

  const remove = async () => {
    if (!confirm(fill(t.profile.deleteDraftsConfirm, { n: ids.length }))) return;
    setBusy(true);
    for (const id of ids) await deleteProject(id);
    forgetLocally(ids);
    setBusy(false);
    router.refresh();
  };

  return (
    <Button type="button" variant="outline" size="lg" onClick={remove} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {t.profile.deleteDrafts} ({ids.length})
    </Button>
  );
}
