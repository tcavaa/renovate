'use client';

import { cn } from '@/lib/utils';

export interface SideListItem {
  id: string;
  label: string;
  hint?: string;
  count?: number | string;
}

/**
 * A vertical index for sidebars — categories, rooms — drawn as soft rows. The active row sits
 * on a sand pill with a terracotta dot; counts sit flush right in tabular figures.
 */
export function SideList({
  title,
  items,
  activeId,
  onSelect,
  className,
}: {
  title?: string;
  items: SideListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {title && <p className="eyebrow mb-2">{title}</p>}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
                className={cn(
                  'relative flex w-full items-center justify-between gap-3 rounded-full py-2.5 pl-7 pr-3 text-left text-sm transition-colors',
                  active ? 'bg-sand font-medium text-ink' : 'text-ink-soft hover:bg-sand/50 hover:text-ink'
                )}
              >
                <span className={cn('absolute left-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full', active ? 'bg-brand' : 'bg-transparent')} />
                <span className="min-w-0 truncate">
                  {item.label}
                  {item.hint && <span className="ml-1.5 text-xs text-ink-muted">{item.hint}</span>}
                </span>
                {item.count !== undefined && item.count !== '' && (
                  <span className={cn('shrink-0 text-xs tabular-nums', active ? 'font-serif text-sm font-semibold text-ink' : 'text-ink-faint')}>{item.count}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
