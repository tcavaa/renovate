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
    <Card className={cn(highlight && 'border-brand bg-brand/5', className)}>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p
          className={cn(
            'mt-2 font-serif text-2xl font-bold tabular-nums',
            highlight ? 'text-brand-dark' : 'text-ink'
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
