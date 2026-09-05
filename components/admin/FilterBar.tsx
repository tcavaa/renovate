'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Filters for an admin list, bound to the URL.
 *
 * Declarative: the page says which fields exist, this component keeps them in sync with the
 * query string. Typing in the search box updates the URL after a short pause; a select or a
 * number updates it at once. Changing any filter drops back to page 1. The page itself is a
 * server component that reads the same parameters, so there is exactly one source of truth.
 */
export type FilterField =
  | { name: string; type: 'search'; placeholder?: string; className?: string }
  | { name: string; type: 'select'; label: string; options: Array<{ value: string; label: string }>; className?: string }
  | { name: string; type: 'number'; placeholder: string; min?: number; step?: number; className?: string }
  | { name: string; type: 'date'; label: string; className?: string };

export interface SortOption {
  value: string;
  label: string;
}

export function FilterBar({
  fields,
  sorts,
  defaultSort,
}: {
  fields: FilterField[];
  /** Sort options rendered as one more select. Values are `key` or `key:asc`. */
  sorts?: SortOption[];
  defaultSort?: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') params.delete(name);
    else params.set(name, value);
    params.delete('page');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const reset = () => router.replace(pathname, { scroll: false });

  const active = [...searchParams.keys()].some((k) => !['sort', 'dir', 'page'].includes(k));

  const currentSort = (() => {
    const sort = searchParams.get('sort');
    const dir = searchParams.get('dir');
    if (!sort) return defaultSort ?? '';
    return dir === 'asc' ? `${sort}:asc` : sort;
  })();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg-surface p-3">
      {fields.map((field) => {
        const value = searchParams.get(field.name) ?? '';
        switch (field.type) {
          case 'search':
            return (
              <SearchInput
                key={field.name}
                value={value}
                placeholder={field.placeholder ?? t.admin.filters.search}
                onCommit={(v) => setParam(field.name, v)}
                className={field.className}
              />
            );
          case 'select':
            return (
              <label key={field.name} className={cn('flex items-center gap-2 text-sm', field.className)}>
                <span className="sr-only">{field.label}</span>
                <select
                  value={value}
                  onChange={(e) => setParam(field.name, e.target.value)}
                  aria-label={field.label}
                  className={selectClass}
                >
                  <option value="">{field.label}: {t.admin.filters.all}</option>
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          case 'number':
            return (
              <Input
                key={field.name}
                type="number"
                inputMode="decimal"
                min={field.min}
                step={field.step}
                placeholder={field.placeholder}
                aria-label={field.placeholder}
                defaultValue={value}
                onBlur={(e) => e.target.value !== value && setParam(field.name, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setParam(field.name, (e.target as HTMLInputElement).value)}
                className={cn('h-9 w-32', field.className)}
              />
            );
          case 'date':
            return (
              <Input
                key={field.name}
                type="date"
                aria-label={field.label}
                title={field.label}
                value={value}
                onChange={(e) => setParam(field.name, e.target.value)}
                className={cn('h-9 w-40', field.className)}
              />
            );
        }
      })}

      {sorts && (
        <select
          value={currentSort}
          aria-label={t.admin.filters.sort}
          onChange={(e) => {
            const [sort, dir] = e.target.value.split(':');
            const params = new URLSearchParams(searchParams.toString());
            if (!sort || sort === defaultSort && !dir) {
              params.delete('sort');
              params.delete('dir');
            } else {
              params.set('sort', sort);
              if (dir) params.set('dir', dir);
              else params.delete('dir');
            }
            params.delete('page');
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
          }}
          className={cn(selectClass, 'ml-auto')}
        >
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {t.admin.filters.sort}: {s.label}
            </option>
          ))}
        </select>
      )}

      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={reset} className="text-ink-muted">
          <X className="h-4 w-4" />
          {t.admin.filters.reset}
        </Button>
      )}
    </div>
  );
}

const selectClass =
  'h-9 rounded-md border border-line bg-bg-surface px-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40';

function SearchInput({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in step when the URL changes from elsewhere (reset, back button).
  useEffect(() => setDraft(value), [value]);

  const schedule = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next.trim()), 350);
  };

  return (
    <div className={cn('relative', className ?? 'w-64')}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <Input
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (timer.current) clearTimeout(timer.current);
            onCommit(draft.trim());
          }
        }}
        className="h-9 pl-9"
      />
    </div>
  );
}
