'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowUpRight, Box, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { mountModelPreview, type ModelPreviewHandle } from '@/lib/design3d/modelPreview';
import { formatGEL } from '@/lib/utils';

/**
 * "See in 3D" on a product page: a drawer slides in from the right with the product's own
 * model on a turntable — drag to turn, scroll to zoom — without leaving the page. The link
 * at the bottom is the way into the studio for anyone who wants it in a room.
 */
export function ProductModelDrawer({ modelUrl, name, price }: { modelUrl: string; name: string; price: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // A callback ref, not a ref object: the drawer's content is portalled and appears a render
  // after `open` flips, so an effect keyed on `open` alone would run before the host exists.
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !host) return;
    let cancelled = false;
    let handle: ModelPreviewHandle | null = null;
    setState('loading');
    mountModelPreview(host, modelUrl)
      .then((h) => {
        if (cancelled) {
          h.dispose();
          return;
        }
        handle = h;
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [open, host, modelUrl]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="ink" size="lg" className="group flex-1">
          <Box className="h-4 w-4" />
          {t.catalog.seeIn3d}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-line bg-bg-surface shadow-cardHover data-[state=open]:animate-in data-[state=closed]:animate-out">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div className="min-w-0">
              <p className="eyebrow">{t.catalog.view3dTitle}</p>
              <DialogPrimitive.Title className="mt-1 truncate font-serif text-xl font-semibold text-ink">{name}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs text-ink-muted">{t.catalog.view3dHint}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="grid h-9 w-9 shrink-0 place-items-center text-ink-muted transition-colors hover:bg-bg-base hover:text-ink" aria-label={t.common.close}>
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="relative min-h-0 flex-1 bg-sand-light">
            <div ref={setHost} className="absolute inset-0" />
            {state === 'loading' && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="flex items-center gap-2 bg-white/80 px-3 py-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  {t.catalog.view3dLoading}
                </span>
              </div>
            )}
            {state === 'failed' && (
              <div className="absolute inset-0 grid place-items-center">
                <span className="border border-danger/40 bg-white px-3 py-2 text-sm text-danger">{t.catalog.view3dFailed}</span>
              </div>
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
            <span className="font-serif text-2xl font-semibold tabular-nums text-ink">{formatGEL(price)}</span>
            <Button asChild variant="outline">
              <Link href="/design">
                {t.design.title}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
