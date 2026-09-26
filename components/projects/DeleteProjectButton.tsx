'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { forgetProject } from '@/lib/flow/projectSync';

/**
 * Deletes one of the caller's projects. `null` when it went, else the API's error code.
 * The browser's caches of it go with it (`forgetProject`): they have nowhere to be saved to.
 */
export async function deleteProject(id: number): Promise<string | null> {
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  const json = (await res.json().catch(() => null)) as { error: string | null } | null;
  if (!res.ok) return json?.error ?? 'UNKNOWN';
  forgetProject(id);
  return null;
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
