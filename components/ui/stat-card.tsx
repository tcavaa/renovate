import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** A labelled headline figure. `highlight` gives it the brand tint used for the grand total. */
export function StatCard({
  label,
  value,
  highlight,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn(highlight && 'border-transparent bg-lime', className)}>
      <CardContent className="p-5">
        <p className={cn('text-xs font-semibold uppercase tracking-wide', highlight ? 'text-ink/70' : 'text-ink-muted')}>{label}</p>
        <p
          className={cn(
            'mt-2 font-display text-2xl tabular-nums',
            'text-ink'
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
