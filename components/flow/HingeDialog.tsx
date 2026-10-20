'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';
import type { CheckoutKind } from '@/lib/finance/money';

/**
 * The hinge of a half: the warning that after this the plan cannot be changed (the steps before
 * it are shut — docs/project-flow.md §12), with what to check now. "Continue" saves the half and
 * goes through the hinge (`onConfirm`: the calculator sets `calculated`, the studio generates).
 * Nothing is paid here any more — the plan the person is on decides what they may do
 * (docs/subscriptions.md); the per-m² fee the halves used to pay before their hinge is gone.
 *
 * The page mounts the dialogue only while it is open, so every opening starts from the warning.
 */
export function HingeDialog({
  open,
  onOpenChange,
  kind,
  save,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CheckoutKind;
  /** Saves the half before it goes through the hinge. */
  save: () => Promise<unknown>;
  onConfirm: () => void;
}) {
  const t = useT();
  const p = t.payment;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = kind === 'design' ? [p.checkRooms, p.checkWalls, p.checkTechnical] : [p.checkHomeState, p.checkRooms, p.checkWalls, p.checkTechnical];

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await save();
    } catch {
      setError(t.market.saveFirstError);
      setSaving(false);
      return;
    }
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="font-serif text-xl">{kind === 'design' ? p.confirmTitleDesign : p.confirmTitleCalculator}</DialogTitle>
          <DialogDescription className="leading-relaxed">{kind === 'design' ? p.confirmBodyDesign : p.confirmBodyCalculator}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 rounded-[12px] border border-line bg-bg-base p-4 text-sm text-ink">
          {checks.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {p.lockNote}
        </p>
        {error && (
          <p role="alert" className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="h-auto min-h-10 whitespace-normal py-2" disabled={saving} onClick={() => onOpenChange(false)}>
            {p.reviewAgain}
          </Button>
          <Button type="button" variant="ink" className="h-auto min-h-10 whitespace-normal py-2" disabled={saving} onClick={() => void confirm()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {p.confirmContinue}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
