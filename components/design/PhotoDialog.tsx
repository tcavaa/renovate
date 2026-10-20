'use client';

import Image from '@/components/ui/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Camera, CheckCircle2, CreditCard, Loader2, Lock, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';
import { profileRendersHref } from '@/lib/projects/links';
import { compressScreenshot } from '@/lib/uploads/browserImage';
import { claimWith, sendToStorage } from '@/lib/uploads/direct';
import { CardPayment, keepOpenOutside } from '@/components/payments/CardPayment';
import { usePlan } from '@/hooks/usePlan';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';

export interface StudioShot {
  /** PNG data URL straight off the canvas. */
  dataUrl: string;
  roomName: string | null;
  camera: { position: [number, number, number]; target: [number, number, number] };
}

type Phase = 'ask' | 'login' | 'pay' | 'saving' | 'queued' | 'error';

/**
 * A data URL as a Blob, decoded by hand: `fetch(dataUrl)` is the usual trick, but the CSP
 * only lets the page connect to itself, so the fetch is refused before it starts.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const type = meta.slice(meta.indexOf(':') + 1, meta.indexOf(';') > 0 ? meta.indexOf(';') : undefined) || 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * "Want a realistic photo of this view?" — shows the screenshot the studio just took and,
 * on yes, saves the project (a draft is enough) and queues the render. Guests are asked to
 * sign in first: renders live with the project in the profile, so there has to be one.
 *
 * Renders are Professional's (docs/subscriptions.md — the studio opens the upgrade dialogue
 * instead of this one on another plan): the dialogue says how many of the month's free renders
 * are left, and once they are used the yes is "pay and request" — Flitt's form for the render's
 * price (`CardPayment`, purpose `render`), whose credit the request then spends.
 */
export function PhotoDialog({
  shot,
  open,
  onOpenChange,
  ensureSaved,
}: {
  shot: StudioShot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the design if it is not saved yet and returns the project id. */
  ensureSaved: () => Promise<number>;
}) {
  const t = useT();
  const { status } = useSession();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('ask');
  const [projectId, setProjectId] = useState<number | null>(null);
  const { state, refresh } = usePlan();
  const freeLeft = state?.renders?.freeLeft ?? 0;
  // Past the month's free renders a render is paid for first, unless admin made them free.
  const mustPay = !!state && freeLeft <= 0 && state.renderPrice > 0;

  useEffect(() => {
    if (open) setPhase('ask');
  }, [open, shot]);

  const request = async () => {
    if (!shot) return;
    if (status !== 'authenticated') {
      setPhase('login');
      return;
    }
    setPhase('saving');
    try {
      const id = await ensureSaved();
      // The screenshot as WebP (or JPEG), straight to storage, then filed by the route (docs/uploads.md).
      const photo = await compressScreenshot(dataUrlToBlob(shot.dataUrl));
      const upload = await sendToStorage('render', photo);
      await claimWith('/api/design/renders', { upload, projectId: id, roomName: shot.roomName ?? null, camera: shot.camera });
      setProjectId(id);
      setPhase('queued');
      void refresh();
    } catch (e) {
      // The month's free ones went in another tab meanwhile: pay for this one.
      if (e instanceof Error && e.message === 'PAYMENT_REQUIRED') {
        await refresh();
        setPhase('pay');
        return;
      }
      setPhase('error');
    }
  };

  const ask = () => {
    if (status !== 'authenticated') {
      setPhase('login');
      return;
    }
    if (mustPay) setPhase('pay');
    else void request();
  };

  // Back to this very page — the studio of this project — once signed in.
  const callback = encodeURIComponent(pathname);

  const paying = phase === 'pay';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!paying}>
      <DialogContent className={cn(paying ? 'max-h-[calc(100dvh-2rem)] max-w-[56rem] overflow-y-auto' : 'max-w-2xl')} backdrop={paying} onInteractOutside={paying ? keepOpenOutside : undefined}>
        {paying && (
          <CardPayment
            request={{ purpose: 'render' }}
            itemLabel={t.plans.renderItem}
            header={
              <DialogHeader>
                <DialogTitle>{t.plans.renderPayTitle}</DialogTitle>
                <DialogDescription>{state ? fill(t.plans.renderWillCost, { price: formatGEL(state.renderPrice) }) : null}</DialogDescription>
              </DialogHeader>
            }
            footer={
              <Button type="button" variant="outline" onClick={() => setPhase('ask')}>
                <ArrowLeft className="h-4 w-4" />
                {t.common.back}
              </Button>
            }
            onNothingToPay={() => void request()}
            onApproved={() => void request()}
          />
        )}
        {shot && !paying && (
          <div className="relative aspect-[16/10] w-full overflow-hidden border border-line bg-sand-light">
            <Image src={shot.dataUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        )}

        {phase === 'ask' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                {t.design.photoAsk}
              </DialogTitle>
              <DialogDescription>{t.design.photoAskDesc}</DialogDescription>
            </DialogHeader>
            {state?.renders && (
              <p className={cn('rounded-[10px] px-3 py-2 text-xs leading-relaxed', mustPay ? 'border border-line bg-bg-base text-ink' : 'bg-success/10 text-ink')}>
                {mustPay ? fill(t.plans.renderWillCost, { price: formatGEL(state.renderPrice) }) : fill(t.plans.renderFreeLeft, { left: freeLeft })}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="ink" size="lg" onClick={ask}>
                {mustPay && <CreditCard className="h-4 w-4" />}
                {mustPay ? t.plans.renderPayAndQueue : t.design.photoYes}
              </Button>
              <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                {t.design.photoNo}
              </Button>
            </div>
          </>
        )}

        {phase === 'login' && (
          <>
            <DialogHeader>
              <div className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-brand/10 text-brand">
                <Lock className="h-5 w-5" />
              </div>
              <DialogTitle>{t.design.photoLoginTitle}</DialogTitle>
              <DialogDescription>{t.design.photoLoginDesc}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="ink" size="lg">
                <Link href={`/login?callbackUrl=${callback}`}>
                  <LogIn className="h-4 w-4" />
                  {t.nav.login}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={`/register?callbackUrl=${callback}`}>
                  <UserPlus className="h-4 w-4" />
                  {t.nav.register}
                </Link>
              </Button>
            </div>
          </>
        )}

        {phase === 'saving' && (
          <div className="flex items-center justify-center gap-3 py-6 text-sm text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            {t.design.saving}
          </div>
        )}

        {phase === 'queued' && (
          <>
            <DialogHeader>
              <div className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <DialogTitle>{t.design.photoQueuedTitle}</DialogTitle>
              <DialogDescription>{t.design.photoQueuedDesc}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="ink" size="lg" onClick={() => onOpenChange(false)}>
                {t.design.continueButton}
              </Button>
              {/* The profile's renders, scrolled to this project's. */}
              <Button asChild variant="outline" size="lg">
                <Link href={profileRendersHref(projectId)}>{t.design.photoOpenRenders}</Link>
              </Button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>{t.design.photoError}</DialogTitle>
              <DialogDescription>{t.common.retry}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="ink" size="lg" onClick={request}>
                {t.common.retry}
              </Button>
              <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                {t.common.close}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
