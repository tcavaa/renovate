import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Camera, Download, Loader2, Sparkles } from 'lucide-react';
import { loadHubRenders, type HubRender } from '@/lib/projects/hub';
import { rendersAnchor } from '@/lib/projects/links';
import { HubDate } from '@/components/projects/hub/HubDate';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';

/**
 * The hubs' "renders": every photo the person took in the studio and the realistic render made
 * from it, grouped by project — the project rendered most recently first, its renders newest
 * first — the photo until the render is ready, then the render. Each group carries an anchor
 * (`rendersAnchor`), so the studio's "see the render" lands on its project's. A photo opens its
 * project's page; the photo, and the render once there is one, download.
 */
export async function HubRenders({ userId, t }: { userId: number; t: Dictionary }) {
  const renders = await loadHubRenders(userId);
  // Newest first already, so each project's group comes in the order of its newest render.
  const groups = new Map<number, { id: number; name: string; renders: HubRender[] }>();
  for (const r of renders) {
    const group = groups.get(r.projectId) ?? { id: r.projectId, name: r.projectName, renders: [] };
    group.renders.push(r);
    groups.set(r.projectId, group);
  }
  const statusLabel: Record<string, string> = {
    queued: t.profile.renderQueued,
    processing: t.profile.renderQueued,
    ready: t.profile.renderReady,
    failed: t.profile.renderFailed,
  };

  return (
    <section className="mt-8">
      <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{t.profile.rendersHint}</p>
      {renders.length === 0 ? (
        <p className="mt-10 rounded-[18px] border border-dashed border-line p-12 text-center text-sm text-ink-muted">{t.profile.noRenders}</p>
      ) : (
        <div className="mt-10 space-y-12">
          {[...groups.values()].map((group) => (
            <section key={group.id} id={rendersAnchor(group.id)} aria-labelledby={`${rendersAnchor(group.id)}-title`} className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
                <h2 id={`${rendersAnchor(group.id)}-title`} className="min-w-0 font-serif text-2xl font-semibold text-ink">
                  <Link href={`/profile/projects/${group.id}`} className="hover:text-brand">
                    {group.name || t.profile.fallbackName}
                  </Link>
                  <span className="ml-3 text-sm font-normal tabular-nums text-ink-muted">{fill(t.hub.rendersCount, { n: group.renders.length })}</span>
                </h2>
                <Link href={`/profile/projects/${group.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-brand">
                  {t.hub.projectPage}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                {group.renders.map((r) => {
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
                          {/* The project is the group's heading: each render says which room, and when. */}
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold leading-snug text-ink">{r.roomName ?? t.design.wholeFlat}</p>
                            <p className="mt-0.5 truncate text-sm text-ink-muted">
                              <HubDate at={r.createdAt} />
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
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
