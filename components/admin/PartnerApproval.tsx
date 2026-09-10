'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import type { ApprovalStatus } from '@/lib/db/schema';

/**
 * Approve or reject a partner who registered themselves. Shown on the admin store and
 * worker pages; a partner admin created is already approved and only shows the badge.
 */
export function PartnerApproval({ kind, id, status }: { kind: 'store' | 'worker'; id: number; status: ApprovalStatus }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState<ApprovalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/${kind === 'store' ? 'stores' : 'workers'}/${id}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(apiErrorMessage(t, json.error));
      return;
    }
    router.refresh();
  };

  const label: Record<ApprovalStatus, string> = { pending: t.admin.approvalPending, approved: t.admin.approvalApproved, rejected: t.admin.approvalRejected };
  const variant: Record<ApprovalStatus, 'warning' | 'success' | 'danger'> = { pending: 'warning', approved: 'success', rejected: 'danger' };

  return (
    <div className={status === 'pending' ? 'border border-warning/50 bg-warning/5 p-4' : 'flex items-center gap-3'}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">{t.admin.approvalTitle}</span>
        <Badge variant={variant[status]}>{label[status]}</Badge>
      </div>
      {status !== 'approved' && (
        <>
          <p className="mt-2 text-sm text-ink-muted">{t.admin.approvalHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => decide('approved')} disabled={busy != null}>
              {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              {t.admin.approve}
            </Button>
            {status !== 'rejected' && (
              <Button type="button" size="sm" variant="outline" onClick={() => decide('rejected')} disabled={busy != null}>
                {busy === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {t.admin.reject}
              </Button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
