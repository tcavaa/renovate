import { formatGEL } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * One line of a cost breakdown: a label on the left, a GEL amount on the right.
 *
 * `bold` is a subtotal, `big` the grand total, `muted` a footnote such as the contingency.
 */
export function MoneyRow({
  label,
  value,
  bold,
  big,
  muted,
}: {
  label: string;
  value: number;
  bold?: boolean;
  big?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={cn(muted && 'truncate text-ink-muted')}>{label}</span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          bold && 'text-base font-bold',
          big && 'font-serif text-2xl font-bold text-brand-dark',
          !bold && !big && 'font-medium',
          muted && 'font-normal text-ink-muted'
        )}
      >
        {formatGEL(value)}
      </span>
    </div>
  );
}
