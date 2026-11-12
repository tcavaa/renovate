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
                  'relative flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors',
                  active ? 'bg-lime font-bold text-ink' : 'font-medium text-ink-soft hover:bg-mist-light hover:text-ink'
                )}
              >
                <span className="min-w-0 truncate">
                  {item.label}
                  {item.hint && <span className={cn('ml-1.5 text-xs font-medium', active ? 'text-ink/60' : 'text-ink-muted')}>{item.hint}</span>}
                </span>
                {item.count !== undefined && item.count !== '' && (
                  <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums', active ? 'bg-ink text-white' : 'bg-mist-light text-ink-muted')}>{item.count}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
