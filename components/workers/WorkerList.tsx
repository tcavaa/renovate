import type { Worker } from '@/lib/db/schema';
import { WorkerCard } from './WorkerCard';

export function WorkerList({ workers, emptyText }: { workers: Worker[]; emptyText: string }) {
  if (workers.length === 0) {
    return <div className="rounded-2xl border border-dashed border-stone bg-sand-light/60 p-16 text-center text-sm text-ink-muted">{emptyText}</div>;
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {workers.map((w) => (
        <WorkerCard key={w.id} worker={w} />
      ))}
    </div>
  );
}
