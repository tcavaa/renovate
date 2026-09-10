'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Camera, CheckCircle2, Loader2, Lock, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';

export interface StudioShot {
  /** PNG data URL straight off the canvas. */
  dataUrl: string;
  roomName: string | null;
  camera: { position: [number, number, number]; target: [number, number, number] };
}

type Phase = 'ask' | 'login' | 'saving' | 'queued' | 'error';

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
  const [phase, setPhase] = useState<Phase>('ask');
  const [projectId, setProjectId] = useState<number | null>(null);

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
      const blob = dataUrlToBlob(shot.dataUrl);
      const form = new FormData();
      form.append('file', new File([blob], 'studio-view.png', { type: 'image/png' }));
      form.append('projectId', String(id));
      if (shot.roomName) form.append('roomName', shot.roomName);
      form.append('camera', JSON.stringify(shot.camera));
      const res = await fetch('/api/design/renders', { method: 'POST', body: form });
      if (!res.ok) throw new Error('render-failed');
      setProjectId(id);
      setPhase('queued');
    } catch {
      setPhase('error');
    }
  };

  const callback = encodeURIComponent('/design/studio');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {shot && (
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
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="ink" size="lg" onClick={request}>
                {t.design.photoYes}
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
                OK
              </Button>
              {projectId != null && (
                <Button asChild variant="outline" size="lg">
                  <Link href={`/profile/projects/${projectId}`}>{t.design.photoOpenProject}</Link>
                </Button>
              )}
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
