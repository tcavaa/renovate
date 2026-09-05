import type { Worker } from '@/lib/db/schema';
import { WorkerCard } from './WorkerCard';

export function WorkerList({ workers, emptyText }: { workers: Worker[]; emptyText: string }) {
  if (workers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-12 text-center text-ink-muted">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {workers.map((w) => (
        <WorkerCard key={w.id} worker={w} />
      ))}
    </div>
  );
}
