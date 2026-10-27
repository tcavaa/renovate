import { cn } from '@/lib/utils';
import { Chevron } from '@/components/layout/Logo';

/** An endlessly scrolling strip of short phrases. CSS only; pauses for reduced motion. */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = [...items, ...items];
  return (
    <div className={cn('relative overflow-hidden', className)} aria-hidden>
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-10 text-sm font-normal uppercase tracking-[0.24em] text-ink-muted">
            {item}
            <Chevron className="h-2.5 w-2.5 text-wood" weight={0.16} />
          </span>
        ))}
      </div>
    </div>
  );
}
