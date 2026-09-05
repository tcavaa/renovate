'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { WorkerList } from '@/components/workers/WorkerList';
import { useWorkers } from '@/hooks/useWorkers';
import { useT } from '@/lib/i18n/client';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';

export default function WorkersPage() {
  const ka = useT();
  const SPECIALTIES = [
    { slug: '', label: ka.common.all },
    ...(['tiling', 'painting', 'plumbing', 'electrical', 'carpentry', 'plastering'] as const).map(
      (slug) => ({ slug, label: workerSpecialtyLabel(ka, slug) })
    ),
  ];
  const [specialty, setSpecialty] = useState<string>('');
  const { items, loading } = useWorkers(specialty || undefined);

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold md:text-4xl">{ka.workers.title}</h1>
        <p className="mt-2 text-ink-muted">{ka.workers.subtitle}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {SPECIALTIES.map((s) => (
          <button
            key={s.slug || 'all'}
            onClick={() => setSpecialty(s.slug)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              specialty === s.slug
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-bg-surface hover:border-brand/40'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      ) : (
        <WorkerList workers={items} />
      )}
    </div>
  );
}
