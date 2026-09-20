'use client';

/**
 * "Start again from step one", on every step of both journeys.
 *
 * It asks first, and what it says depends on what is at stake: nothing yet, work that was
 * never saved, or a flat that has been laid out in 3D — which took a generation to make and
 * cannot be had back by pressing undo.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';
import { readFlowState, resetFlow, type FlowKind } from '@/lib/flow/reset';
import { cn } from '@/lib/utils';

export function StartOverButton({ kind, className }: { kind: FlowKind; className?: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => ({ hasWork: false, saved: false, generated: false }));

  const ask = () => {
    setState(readFlowState(kind));
    setOpen(true);
  };

  const start = () => {
    resetFlow();
    setOpen(false);
    router.push(kind === 'calculator' ? '/calculator' : '/design');
  };

  const warning = !state.hasWork
    ? t.flow.resetNothing
    : state.saved
      ? t.flow.resetSaved
      : state.generated
        ? t.flow.resetGenerated
        : t.flow.resetUnsaved;

  return (
    <>
      <button
        type="button"
        onClick={ask}
        title={t.flow.startOver}
        className={cn('flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink', className)}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t.flow.startOver}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
              <RotateCcw className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">{t.flow.startOver}</DialogTitle>
            <DialogDescription className="text-center">{warning}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="ink" onClick={start}>
              <RotateCcw className="h-4 w-4" />
              {t.flow.startOverConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
