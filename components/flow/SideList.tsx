'use client';

import { cn } from '@/lib/utils';

export interface SideListItem {
  id: string;
  label: string;
  hint?: string;
  count?: number | string;
}

/**
 * A vertical index for sidebars — categories, rooms — drawn as a hairline list. The active
 * row carries a 2 px ink rule on its left edge; counts sit flush right in tabular figures.
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
      <ul className="border-t border-line">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="border-b border-line">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
                className={cn(
                  'relative flex w-full items-center justify-between gap-3 py-2.5 pl-4 pr-1 text-left text-sm transition-colors',
                  active ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink'
                )}
              >
                <span className={cn('absolute inset-y-0 left-0 w-[2px]', active ? 'bg-ink' : 'bg-transparent')} />
                <span className="min-w-0 truncate">
                  {item.label}
                  {item.hint && <span className="ml-1.5 text-xs text-ink-muted">{item.hint}</span>}
                </span>
                {item.count !== undefined && item.count !== '' && (
                  <span className={cn('shrink-0 text-xs tabular-nums', active ? 'text-ink' : 'text-ink-faint')}>{item.count}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
