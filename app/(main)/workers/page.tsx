import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { WorkerList } from '@/components/workers/WorkerList';
import { getT } from '@/lib/i18n/server';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SPECIALTY_SLUGS = ['tiling', 'painting', 'plumbing', 'electrical', 'carpentry', 'plastering'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.workers.title, description: t.workers.subtitle };
}

/** Public worker directory, server-rendered with the specialty filter in the URL. */
export default async function WorkersPage(props: { searchParams: Promise<{ specialty?: string }> }) {
  const searchParams = await props.searchParams;
  const ka = await getT();
  const specialty = searchParams.specialty ?? '';

  const conditions = [eq(workers.isActive, true)];
  if (specialty) conditions.push(eq(workers.specialtySlug, specialty));

  const items = await db
    .select()
    .from(workers)
    .where(and(...conditions))
    .orderBy(desc(workers.isVerified), desc(workers.rating));

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold md:text-4xl">{ka.workers.title}</h1>
        <p className="mt-2 text-ink-muted">{ka.workers.subtitle}</p>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label={ka.workers.specialty}>
        <Chip href="/workers" active={specialty === ''}>
          {ka.common.all}
        </Chip>
        {SPECIALTY_SLUGS.map((slug) => (
          <Chip key={slug} href={`/workers?specialty=${slug}`} active={specialty === slug}>
            {workerSpecialtyLabel(ka, slug)}
          </Chip>
        ))}
      </nav>

      <WorkerList workers={items} emptyText={ka.workers.noWorkers} />
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'border px-4 py-1.5 text-sm transition-colors',
        active ? 'border-brand bg-brand text-white' : 'border-line bg-bg-surface hover:border-brand/40'
      )}
    >
      {children}
    </Link>
  );
}
