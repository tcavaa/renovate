import Image from 'next/image';
import { desc, eq } from 'drizzle-orm';
import { Camera, Download, Loader2 } from 'lucide-react';
import { db } from '@/lib/db';
import { projectRenders } from '@/lib/db/schema';
import type { Dictionary, Locale } from '@/lib/i18n';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { cn } from '@/lib/utils';

/**
 * The photos taken in the studio for this project and the realistic renders made from
 * them: the screenshot is downloadable at once, the render when it is ready. Server
 * component — reads the database.
 */
export async function ProjectRenders({ projectId, t, locale }: { projectId: number; t: Dictionary; locale: Locale }) {
  const rows = await db.select().from(projectRenders).where(eq(projectRenders.projectId, projectId)).orderBy(desc(projectRenders.createdAt));
  const dateLocale = dateLocaleFor(locale);
  const statusLabel: Record<string, string> = {
    queued: t.profile.renderQueued,
    processing: t.profile.renderQueued,
    ready: t.profile.renderReady,
    failed: t.profile.renderFailed,
  };

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          {t.profile.renders} <span className="ml-2 text-base font-normal text-ink-muted">({rows.length})</span>
        </h2>
      </div>
      <p className="mt-2 text-sm text-ink-muted">{t.profile.rendersHint}</p>
      {rows.length === 0 ? (
        <p className="mt-4 border border-dashed border-line p-10 text-center text-sm text-ink-muted">{t.profile.noRenders}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const shown = r.status === 'ready' && r.renderUrl ? r.renderUrl : r.sourceUrl;
            return (
              <li key={r.id} className="border border-line bg-bg-surface">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-sand-light">
                  <Image src={shown} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
                  <span className={cn('absolute left-3 top-3 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]', r.status === 'ready' ? 'bg-success text-white' : r.status === 'failed' ? 'bg-danger text-white' : 'bg-ink/80 text-white')}>
                    {r.status === 'queued' || r.status === 'processing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                    {statusLabel[r.status] ?? r.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-muted">
                  <span className="truncate">
                    {r.roomName ?? t.design.wholeFlat} · {new Date(r.createdAt).toLocaleString(dateLocale)}
                  </span>
                  <span className="flex items-center gap-3">
                    <a href={r.sourceUrl} download className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand">
                      <Download className="h-3.5 w-3.5" />
                      {t.profile.downloadPhoto}
                    </a>
                    {r.status === 'ready' && r.renderUrl && (
                      <a href={r.renderUrl} download className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand">
                        <Download className="h-3.5 w-3.5" />
                        {t.profile.downloadRender}
                      </a>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
