import Image from 'next/image';
import Link from 'next/link';
import { Camera, Download, Loader2, Sparkles } from 'lucide-react';
import { loadHubRenders } from '@/lib/projects/hub';
import { HubDate } from '@/components/projects/hub/HubDate';
import { cn } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';

/**
 * The hubs' "renders": every photo the person took in the studio and the realistic render made
 * from it, across their projects, newest first — the photo until the render is ready, then the
 * render. Each opens its project's page; the photo, and the render once there is one, download.
 */
export async function HubRenders({ userId, t }: { userId: number; t: Dictionary }) {
  const renders = await loadHubRenders(userId);
  const statusLabel: Record<string, string> = {
    queued: t.profile.renderQueued,
    processing: t.profile.renderQueued,
    ready: t.profile.renderReady,
    failed: t.profile.renderFailed,
  };

  return (
    <section className="mt-8" aria-labelledby="hub-renders">
      <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{t.profile.rendersHint}</p>
      <h2 id="hub-renders" className="mt-10 text-sm font-medium text-ink-muted">
        {t.hub.rendersByDate}
      </h2>
      {renders.length === 0 ? (
        <p className="mt-5 rounded-[18px] border border-dashed border-line p-12 text-center text-sm text-ink-muted">{t.profile.noRenders}</p>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
          {renders.map((r) => {
            const ready = r.status === 'ready' && !!r.renderUrl;
            const shown = ready ? r.renderUrl! : r.sourceUrl;
            const waiting = r.status === 'queued' || r.status === 'processing';
            return (
              <li key={r.id}>
                <article>
                  <Link href={`/profile/projects/${r.projectId}`} tabIndex={-1} aria-hidden className="relative block aspect-[5/4] overflow-hidden rounded-[18px] border border-line bg-bg-surface transition-shadow hover:shadow-cardHover">
                    <Image src={shown} alt="" fill unoptimized sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
                    <span className={cn('absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', ready ? 'bg-success text-white' : r.status === 'failed' ? 'bg-danger text-white' : 'bg-ink/80 text-white')}>
                      {waiting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                      {statusLabel[r.status] ?? r.status}
                    </span>
                  </Link>
                  <div className="mt-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/profile/projects/${r.projectId}`} className="block truncate text-lg font-semibold leading-snug text-ink hover:text-brand">
                        {r.projectName || t.profile.fallbackName}
                      </Link>
                      <p className="mt-0.5 truncate text-sm text-ink-muted">
                        {r.roomName ?? t.design.wholeFlat} · <HubDate at={r.createdAt} />
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a href={r.sourceUrl} download title={t.profile.downloadPhoto} aria-label={t.profile.downloadPhoto} className="grid h-9 w-9 place-items-center rounded-full bg-sand-light text-ink-muted transition-colors hover:bg-sand hover:text-ink">
                        <Download className="h-4 w-4" />
                      </a>
                      {ready && (
                        <a href={r.renderUrl!} download title={t.profile.downloadRender} aria-label={t.profile.downloadRender} className="grid h-9 w-9 place-items-center rounded-full bg-sand-light text-ink-muted transition-colors hover:bg-sand hover:text-ink">
                          <Sparkles className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
