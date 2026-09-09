'use client';

import { useState } from 'react';
import { CheckCircle2, MailWarning, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';

/**
 * Tells a password-account user that their address is unconfirmed and offers to resend the
 * link. Also shows the result of clicking a verification link (`?verified=1|0`).
 */
export function VerifyEmailBanner({
  needsVerification,
  verifiedFlag,
}: {
  needsVerification: boolean;
  verifiedFlag?: string;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (verifiedFlag === '1') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        {t.auth.verifiedOk}
      </div>
    );
  }
  if (verifiedFlag === '0' && !needsVerification) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
        <XCircle className="h-5 w-5 shrink-0 text-danger" />
        {t.auth.verifiedFail}
      </div>
    );
  }
  if (!needsVerification) return null;

  const resend = async () => {
    setState('sending');
    try {
      const res = await fetch('/api/auth/verify', { method: 'POST' });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
      <MailWarning className="h-5 w-5 shrink-0 text-warning" />
      <span className="flex-1">{verifiedFlag === '0' ? t.auth.verifiedFail : t.auth.verifyBanner}</span>
      {state === 'sent' ? (
        <span className="font-medium text-success">{t.auth.verifySent}</span>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={resend} disabled={state === 'sending'}>
          {t.auth.verifySend}
        </Button>
      )}
      {state === 'error' && <span className="text-danger">{t.common.error}</span>}
    </div>
  );
}
