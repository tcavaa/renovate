'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownUp, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { rememberList } from '@/lib/admin/listMemory';
import { dateRangeSummary, optionMatches, plainOptionLabel, rangeSummary } from '@/lib/admin/filters';
import { cn } from '@/lib/utils';

/**
 * Filters for an admin list, bound to the URL.
 *
 * Declarative: the page says which fields exist, this component keeps them in sync with the
 * query string, and the page — a server component reading the same parameters — does the
 * filtering, so there is one source of truth. The search box and the sort run along the top;
 * every other filter is a button under them that says what it is set to ("Status: active") and
 * opens its choices — a list (searchable when it is long, like the category tree), or a range
 * (price, cost, dates) with both ends in one place. A set filter is dark and carries its own
 * ×; "clear filters" takes them all off. Typing in the search updates the URL after a short
 * pause; anything else at once, and back to page 1.
 *
 * The list's state is remembered as it changes (`lib/admin/listMemory`), so the breadcrumbs,
 * the sidebar and a form's save come back to the list as it was left.
 */
export interface FilterOption {
  value: string;
  label: string;
}

export type FilterField =
  | { name: string; type: 'search'; placeholder?: string }
  | { name: string; type: 'select'; label: string; options: FilterOption[] }
  /** A number or a date between two ends, each its own parameter; a range may have one end only. */
  | { type: 'range'; label: string; min?: string; max?: string; unit?: string; step?: number }
  | { type: 'dateRange'; label: string; from: string; to: string };

export interface SortOption {
  value: string;
  label: string;
}

type SearchField = Extract<FilterField, { type: 'search' }>;
type ChoiceField = Exclude<FilterField, { type: 'search' }>;

/** The URL parameters a field sets. */
function fieldParams(field: FilterField): string[] {
  if (field.type === 'range') return [field.min, field.max].filter((n): n is string => !!n);
  if (field.type === 'dateRange') return [field.from, field.to];
  return [field.name];
}

function fieldKey(field: FilterField): string {
  return fieldParams(field).join('|');
}

export function FilterBar({
  fields,
  sorts,
  defaultSort,
}: {
  fields: FilterField[];
  /** Sort options, as a menu at the end of the top row. Values are `key` or `key:asc`. */
  sorts?: SortOption[];
  defaultSort?: string;
}) {
  const t = useT();
  const f = t.admin.filters;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Every road back to this list — the breadcrumbs, the sidebar, a form's save — comes back to it as it is now.
  useEffect(() => {
    rememberList(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  const get = (name: string) => searchParams.get(name) ?? '';
  const replace = (params: URLSearchParams) => {
    params.delete('page');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const setParams = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === '') params.delete(key);
      else params.set(key, value);
    }
    replace(params);
  };
  const reset = () => router.replace(pathname, { scroll: false });

  const search = fields.find((field): field is SearchField => field.type === 'search');
  const filters = fields.filter((field): field is ChoiceField => field.type !== 'search');
  const setCount = filters.filter((field) => fieldParams(field).some((name) => get(name) !== '')).length;
  const anything = [...searchParams.keys()].some((k) => !['sort', 'dir', 'page'].includes(k));

  const currentSort = (() => {
    const sort = searchParams.get('sort');
    if (!sort) return defaultSort ?? sorts?.[0]?.value ?? '';
    return searchParams.get('dir') === 'asc' ? `${sort}:asc` : sort;
  })();
  const setSort = (value: string) => {
    const [sort, dir] = value.split(':');
    const params = new URLSearchParams(searchParams.toString());
    if (!sort || (sort === defaultSort && !dir)) {
      params.delete('sort');
      params.delete('dir');
    } else {
      params.set('sort', sort);
      if (dir) params.set('dir', dir);
      else params.delete('dir');
    }
    replace(params);
  };

  return (
    <FilterFrame
      search={search && <FilterSearch value={get(search.name)} placeholder={search.placeholder ?? f.search} onCommit={(v) => setParams({ [search.name]: v })} className="min-w-[14rem] max-w-2xl flex-1" />}
      sort={sorts && sorts.length > 0 && <FilterMenu label={f.sort} icon={<ArrowDownUp className="h-3.5 w-3.5" />} options={sorts} value={currentSort} onChange={setSort} plain />}
      filters={filters.map((field) => (
        <FieldControl key={fieldKey(field)} field={field} get={get} setParams={setParams} />
      ))}
      setCount={setCount}
      onReset={anything ? reset : undefined}
    />
  );
}

/**
 * The bar itself: the search and the sort along the top, the filters under them with how many
 * are set, and "clear filters" at the end while anything is. The URL-bound `FilterBar` fills it,
 * and so does a list that filters in the browser (the rate book).
 */
export function FilterFrame({ search, sort, filters = [], setCount = 0, onReset }: { search?: ReactNode; sort?: ReactNode; filters?: ReactNode[]; setCount?: number; onReset?: () => void }) {
  const t = useT();
  const f = t.admin.filters;
  const resetButton = onReset && (
    <button type="button" onClick={onReset} className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 px-2 text-xs font-medium text-ink-muted transition-colors hover:text-danger">
      <X className="h-3.5 w-3.5" />
      {f.reset}
    </button>
  );
  const top = !!search || !!sort;
  return (
    <div className="border border-line bg-bg-surface">
      {top && (
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          {search}
          {sort && <div className="ml-auto">{sort}</div>}
          {filters.length === 0 && resetButton}
        </div>
      )}
      {filters.length > 0 && (
        <div className={cn('flex flex-wrap items-center gap-1.5 px-2.5 py-2', top && 'border-t border-line')}>
          <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            {f.title}
            {setCount > 0 && <span className="grid h-4 min-w-4 place-items-center bg-ink px-1 text-[10px] tabular-nums text-white">{setCount}</span>}
          </span>
          {filters}
          {resetButton}
        </div>
      )}
    </div>
  );
}

/** One filter of the bar: a list, a toggle (a list of one), or a range. */
function FieldControl({ field, get, setParams }: { field: ChoiceField; get: (name: string) => string; setParams: (patch: Record<string, string>) => void }) {
  const t = useT();
  const f = t.admin.filters;
  if (field.type === 'select') {
    // A filter with one choice is a switch, not a list.
    if (field.options.length === 1) {
      const only = field.options[0];
      return <FilterToggle label={only.label} on={get(field.name) === only.value} onChange={(on) => setParams({ [field.name]: on ? only.value : '' })} />;
    }
    return <FilterMenu label={field.label} options={field.options} value={get(field.name)} onChange={(value) => setParams({ [field.name]: value })} allLabel={f.all} />;
  }
  if (field.type === 'range') {
    const inputs = [
      field.min ? { name: field.min, caption: f.from, value: get(field.min) } : null,
      field.max ? { name: field.max, caption: f.to, value: get(field.max) } : null,
    ].filter((x): x is { name: string; caption: string; value: string } => x != null);
    return <FilterInputs label={field.label} summary={rangeSummary(field.min ? get(field.min) : '', field.max ? get(field.max) : '', field.unit)} type="number" step={field.step} inputs={inputs} onApply={setParams} />;
  }
  return (
    <FilterInputs
      label={field.label}
      summary={dateRangeSummary(get(field.from), get(field.to))}
      type="date"
      inputs={[
        { name: field.from, caption: f.from, value: get(field.from) },
        { name: field.to, caption: f.to, value: get(field.to) },
      ]}
      onApply={setParams}
    />
  );
}

// ---------------------------------------------------------------------------
// The pieces, also for a list that filters in the browser (the rate book)
// ---------------------------------------------------------------------------

/** The search box: commits a short pause after typing stops, or on Enter; × empties it. */
export function FilterSearch({ value, placeholder, onCommit, className }: { value: string; placeholder: string; onCommit: (value: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value);
  // What this box last sent, and the value last seen: the URL catches up with a commit a beat
  // later, and only a change that did not come from here (clear filters, the back button) may
  // replace what is being typed. (State adjusted while rendering, the way React asks for a
  // prop to be followed.)
  const [committed, setCommitted] = useState(value);
  const [followed, setFollowed] = useState(value);
  if (followed !== value) {
    setFollowed(value);
    if (value !== committed) {
      setCommitted(value);
      setDraft(value);
    }
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const send = (next: string) => {
    setCommitted(next);
    onCommit(next);
  };
  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    send(next.trim());
  };
  const schedule = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send(next.trim()), 350);
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.code === 'Enter' || e.code === 'NumpadEnter') commit(draft);
        }}
        className="h-9 w-full border border-line bg-bg-base pl-9 pr-9 text-sm text-ink transition-colors placeholder:text-ink-muted focus:border-ink focus:bg-bg-surface focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            commit('');
          }}
          aria-label={placeholder}
          className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-ink-muted hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * A filter's button and the panel it opens. Unset it reads as its name; set it turns dark,
 * says what it is set to and carries an × of its own. `plain` keeps it light whatever its value
 * (the sort, which always has one). The panel closes on a click outside it and on Escape.
 */
function FilterPopover({
  label,
  summary,
  onClear,
  plain = false,
  icon,
  className,
  children,
}: {
  label: string;
  /** What the filter is set to; null while it is not set. */
  summary: string | null;
  onClear?: () => void;
  plain?: boolean;
  icon?: ReactNode;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A choice made in the panel closes it and puts the focus back on the button; a click on
  // something else leaves the focus where it went.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && (document.activeElement == null || document.activeElement === document.body)) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const toggle = () => {
    // A panel that would run off the right edge of the window opens leftwards instead.
    if (!open && ref.current) setAlignRight(ref.current.getBoundingClientRect().left + 288 > window.innerWidth - 16);
    setOpen((v) => !v);
  };
  const close = () => setOpen(false);
  const set = summary != null && !plain;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className={cn('inline-flex h-8 items-stretch border text-xs transition-colors', set ? 'border-ink bg-ink text-white' : open ? 'border-ink bg-bg-surface text-ink' : 'border-line bg-bg-surface text-ink-soft hover:border-ink/50 hover:text-ink')}>
        <button ref={trigger} type="button" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" className="inline-flex min-w-0 items-center gap-1.5 px-2.5 font-medium">
          {icon}
          <span className={cn('shrink-0', set && 'text-white/65')}>
            {label}
            {summary != null && ':'}
          </span>
          {summary != null && <span className={cn('max-w-[14rem] truncate', set ? 'font-semibold text-white' : 'font-semibold text-ink')}>{summary}</span>}
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
        </button>
        {set && onClear && (
          <button type="button" onClick={onClear} aria-label={`${t.admin.filters.clearOne}: ${label}`} title={t.admin.filters.clearOne} className="grid w-7 place-items-center border-l border-white/20 text-white/80 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div role="dialog" aria-label={label} className={cn('absolute top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] border border-line bg-bg-surface shadow-cardHover', alignRight ? 'right-0' : 'left-0')}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

/**
 * A filter with a list of choices ("all" first, unless `allLabel` is left out). A list longer
 * than eight gets a search box of its own, the arrow keys move through it, and a choice closes
 * the panel.
 */
export function FilterMenu({
  label,
  options,
  value,
  onChange,
  allLabel,
  plain,
  icon,
  className,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** The choice that sets nothing; left out, a choice is always made (the sort). */
  allLabel?: string;
  plain?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const selected = value !== '' ? options.find((o) => o.value === value) : undefined;
  return (
    <FilterPopover label={label} summary={selected ? plainOptionLabel(selected.label) : null} onClear={allLabel != null ? () => onChange('') : undefined} plain={plain} icon={icon} className={className}>
      {(close) => (
        <OptionList
          label={label}
          options={options}
          value={value}
          allLabel={allLabel}
          onPick={(next) => {
            onChange(next);
            close();
          }}
        />
      )}
    </FilterPopover>
  );
}

function OptionList({ label, options, value, allLabel, onPick }: { label: string; options: FilterOption[]; value: string; allLabel?: string; onPick: (value: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchable = options.length > 8;
  const shown = query ? options.filter((o) => optionMatches(o.label, query)) : options;

  // The search box when there is one, else the choice that is on.
  useEffect(() => {
    if (searchable) input.current?.focus();
    else (list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }, [searchable]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.code !== 'ArrowDown' && event.code !== 'ArrowUp') return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.code === 'ArrowDown') items[Math.min(items.length - 1, at + 1)].focus();
    else if (at <= 0) (searchable ? input.current : items[0])?.focus();
    else items[at - 1].focus();
  };

  return (
    <div onKeyDown={onKeyDown}>
      {searchable && (
        <div className="border-b border-line p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.code === 'Enter' || e.code === 'NumpadEnter') && shown.length > 0) {
                  e.preventDefault();
                  onPick(shown[0].value);
                }
              }}
              placeholder={t.admin.filters.search}
              aria-label={`${label}: ${t.admin.filters.search}`}
              className="h-8 w-full border border-line bg-bg-base pl-8 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-ink focus:bg-bg-surface focus:outline-none"
            />
          </div>
        </div>
      )}
      <div ref={list} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
        {allLabel != null && !query && <OptionRow label={allLabel} selected={value === ''} muted onClick={() => onPick('')} />}
        {shown.map((o) => (
          <OptionRow key={o.value} label={query ? plainOptionLabel(o.label) : o.label} selected={o.value === value} onClick={() => onPick(o.value)} />
        ))}
        {shown.length === 0 && <p className="px-3 py-2 text-xs text-ink-muted">{t.admin.filters.noOptions}</p>}
      </div>
    </div>
  );
}

function OptionRow({ label, selected, muted, onClick }: { label: string; selected: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg-base focus:bg-bg-base focus:outline-none', selected ? 'font-semibold text-ink' : muted ? 'text-ink-muted' : 'text-ink-soft')}
    >
      <span className="grid w-3.5 shrink-0 place-items-center">{selected && <Check className="h-3.5 w-3.5 text-brand" />}</span>
      <span className="min-w-0 whitespace-pre">{label}</span>
    </button>
  );
}

/** A filter with one choice — "featured only", "unread" — as a switch. */
export function FilterToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn('inline-flex h-8 items-center gap-1.5 border px-2.5 text-xs font-medium transition-colors', on ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface text-ink-soft hover:border-ink/50 hover:text-ink')}
    >
      <span className={cn('grid h-3.5 w-3.5 place-items-center border', on ? 'border-white bg-white text-ink' : 'border-ink-muted/60')}>{on && <Check className="h-3 w-3" />}</span>
      {label}
    </button>
  );
}

/** A filter typed in: one end or both of a number or a date range, applied together. */
function FilterInputs({
  label,
  summary,
  type,
  step,
  inputs,
  onApply,
}: {
  label: string;
  summary: string | null;
  type: 'number' | 'date';
  step?: number;
  inputs: Array<{ name: string; caption: string; value: string }>;
  onApply: (values: Record<string, string>) => void;
}) {
  const t = useT();
  const f = t.admin.filters;
  const clearAll = () => onApply(Object.fromEntries(inputs.map((i) => [i.name, ''])));
  return (
    <FilterPopover label={label} summary={summary} onClear={clearAll}>
      {(close) => (
        <RangeForm
          type={type}
          step={step}
          inputs={inputs}
          applyLabel={f.apply}
          clearLabel={f.clearOne}
          onApply={(values) => {
            onApply(values);
            close();
          }}
          onClear={() => {
            clearAll();
            close();
          }}
        />
      )}
    </FilterPopover>
  );
}

function RangeForm({ type, step, inputs, applyLabel, clearLabel, onApply, onClear }: { type: 'number' | 'date'; step?: number; inputs: Array<{ name: string; caption: string; value: string }>; applyLabel: string; clearLabel: string; onApply: (values: Record<string, string>) => void; onClear: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(inputs.map((i) => [i.name, i.value])));
  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])));
      }}
    >
      <div className="flex items-end gap-2">
        {inputs.map((input, i) => (
          <Fragment key={input.name}>
            {i > 0 && <span className="pb-2 text-ink-faint">–</span>}
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{input.caption}</span>
              <input
                type={type}
                inputMode={type === 'number' ? 'decimal' : undefined}
                min={type === 'number' ? 0 : undefined}
                step={step}
                autoFocus={i === 0}
                value={draft[input.name] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [input.name]: e.target.value }))}
                className="h-8 w-full border border-line bg-bg-base px-2 text-xs tabular-nums text-ink focus:border-ink focus:bg-bg-surface focus:outline-none"
              />
            </label>
          </Fragment>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onClear} className="text-xs text-ink-muted transition-colors hover:text-ink">
          {clearLabel}
        </button>
        <button type="submit" className="h-8 bg-ink px-3 text-xs font-semibold text-white transition-colors hover:bg-brand">
          {applyLabel}
        </button>
      </div>
    </form>
  );
}
