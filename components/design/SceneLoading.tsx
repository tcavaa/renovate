'use client';

/**
 * The 3D view's loading screen. It covers the canvas from the moment the view opens — first
 * while three.js itself arrives (the studio's `ViewerFallback`), then while the flat's models
 * and finishes are fetched (`Viewer3D`, counting through `lib/design3d/loadProgress`) — so a
 * freshly generated flat appears whole rather than a sofa, a lamp and a floor at a time.
 */

import { Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function SceneLoading({ done, total, leaving = false }: { /** Files in so far; with `total`, a bar fills. */ done?: number; total?: number; /** Fading out: the flat is ready. */ leaving?: boolean }) {
  const t = useT();
  const counted = total != null && total > 0 && done != null;
  const share = counted ? Math.min(1, done / total) : 0;
  return (
    <div
      className={cn('absolute inset-0 z-10 grid place-items-center bg-sand-light transition-opacity duration-300', leaving && 'pointer-events-none opacity-0')}
      role="status"
      aria-live="polite"
    >
      <div className="w-[min(88vw,340px)] rounded-[20px] border border-line bg-white p-5 shadow-cardHover">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand" />
          <p className="text-sm font-medium text-ink">{t.build.sceneLoading}</p>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sand">
          <div className={cn('h-full rounded-full bg-brand transition-[width] duration-300', !counted && 'w-1/4 animate-pulse')} style={counted ? { width: `${Math.max(4, Math.round(share * 100))}%` } : undefined} />
        </div>
        <p className="mt-3 text-xs tabular-nums text-ink-muted">{counted ? t.build.sceneLoadingCount.replace('{done}', String(done)).replace('{total}', String(total)) : t.build.sceneLoadingHint}</p>
      </div>
    </div>
  );
}
