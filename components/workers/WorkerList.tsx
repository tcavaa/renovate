import type { Worker } from '@/lib/db/schema';
import { WorkerCard } from './WorkerCard';

export function WorkerList({ workers, emptyText }: { workers: Worker[]; emptyText: string }) {
  if (workers.length === 0) {
    return <div className="dots rounded-2xl bg-mist-light p-16 text-center text-sm font-medium text-ink-muted">{emptyText}</div>;
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {workers.map((w) => (
        <WorkerCard key={w.id} worker={w} />
      ))}
    </div>
  );
}
