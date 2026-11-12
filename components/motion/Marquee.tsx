import { cn } from '@/lib/utils';

/** An endlessly scrolling strip of short phrases. CSS only; pauses for reduced motion. */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = [...items, ...items];
  return (
    <div className={cn('relative overflow-hidden', className)} aria-hidden>
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-lg text-white">
            {item}
            <span className="h-2.5 w-2.5 bg-lime" />
          </span>
        ))}
      </div>
    </div>
  );
}
