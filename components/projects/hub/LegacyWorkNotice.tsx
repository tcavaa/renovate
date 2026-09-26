'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calculatorEntryHref } from '@/lib/calculator/steps';
import { designEntryHref } from '@/lib/design/steps';
import { claimBrowser } from '@/lib/flow/owner';
import { adoptLegacyWork, discardLegacyWork, legacyUnsavedWork } from '@/lib/flow/legacy';
import { useT } from '@/lib/i18n/client';

/**
 * Work this browser still holds from before every journey belonged to a project — a
 * calculation or a design that was never saved anywhere (`lib/flow/legacy`). Offered once, on
 * this product's hub: kept, it becomes a new project that opens on it and saves it; let go, it
 * is gone. Nothing is shown when there is none, which is known only in the browser.
 */
export function LegacyWorkNotice({ userId, journey }: { userId: number; journey: 'calculator' | 'design' }) {
  const t = useT();
  const router = useRouter();
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // The browser is the account's before anything in it is offered as the account's work.
    claimBrowser(userId);
    setPresent(legacyUnsavedWork()[journey]);
  }, [userId, journey]);

  if (!present) return null;

  const keep = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const id = await adoptLegacyWork(journey, t.hub.legacyName);
      router.push(journey === 'calculator' ? calculatorEntryHref(id) : designEntryHref(id));
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  const discard = () => {
    discardLegacyWork(journey);
    setPresent(false);
  };

  return (
    <section role="status" className="mt-8 flex flex-col gap-4 border border-brand/40 bg-brand-50 p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex max-w-2xl gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
        <div>
          <h2 className="font-semibold text-ink">{t.hub.legacyTitle}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{journey === 'calculator' ? t.hub.legacyCalculatorText : t.hub.legacyDesignText}</p>
          {failed && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {t.hub.legacyFailed}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="ink" onClick={keep} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.hub.legacyKeep}
        </Button>
        <Button type="button" variant="outline" onClick={discard} disabled={busy}>
          {t.hub.legacyDiscard}
        </Button>
      </div>
    </section>
  );
}
