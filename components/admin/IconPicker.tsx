'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { icons, ImageOff, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CategoryIcon, lucideIconFor } from '@/components/admin/CategoryIcon';
import { ICON_GROUPS, SUGGESTED_ICONS, iconKebabName, iconLookupKey, iconMatches, type IconSuggestion } from '@/lib/admin/icons';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

/** Every lucide icon by its kebab name, the suggested ones left out (they are listed first). */
const SUGGESTED_KEYS = new Set(SUGGESTED_ICONS.map((s) => iconLookupKey(s.name)));
const OTHER_ICONS = Object.keys(icons)
  .map(iconKebabName)
  .filter((name) => !SUGGESTED_KEYS.has(iconLookupKey(name)));
const TOTAL = SUGGESTED_ICONS.length + OTHER_ICONS.length;
/** The full list is long: this many at first, the rest on request or by searching. */
const FIRST = 240;

/**
 * The category form's icon field: the chosen icon and its name, and a window listing lucide's
 * icons to choose from — the ones a renovation catalogue needs first, grouped (tiles, doors,
 * sockets, radiators, beds…), then all the others. The search takes Georgian, Russian or
 * English words (lucide's own names are English). Loaded with the form only (`CategoryForm`).
 */
export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const t = useT();
  const p = t.admin.iconPicker;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const q = useDeferredValue(query);
  const searching = q.trim() !== '';

  const suggested = useMemo(() => SUGGESTED_ICONS.filter((s) => iconMatches(s.name, q, s.words)), [q]);
  const others = useMemo(() => OTHER_ICONS.filter((name) => iconMatches(name, q)), [q]);
  const shownOthers = showAll || searching ? others : others.slice(0, FIRST);
  const known = !value || lucideIconFor(value) != null;
  const selectedKey = value ? iconLookupKey(value) : null;

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const tile = (name: string) => (
    <button
      key={name}
      type="button"
      title={name}
      onClick={() => choose(name)}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1.5 border px-1 py-2.5 text-[10px] leading-none transition-colors',
        selectedKey === iconLookupKey(name) ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface text-ink-muted hover:border-ink hover:text-ink'
      )}
    >
      <CategoryIcon icon={name} className="h-5 w-5" strokeWidth={1.75} />
      <span className="w-full truncate text-center font-mono">{name}</span>
    </button>
  );

  const grid = (names: string[]) => <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">{names.map(tile)}</div>;
  const byGroup = (list: IconSuggestion[]) => ICON_GROUPS.map((g) => ({ group: g, names: list.filter((s) => s.group === g).map((s) => s.name) })).filter((g) => g.names.length > 0);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 min-w-0 flex-1 items-center gap-3 border border-line bg-bg-surface px-3 text-left text-sm transition-colors hover:border-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center border border-line text-ink">
            <CategoryIcon icon={value} className="h-4 w-4" fallback={<ImageOff className="h-4 w-4 text-ink-muted" aria-hidden />} />
          </span>
          <span className={cn('min-w-0 flex-1 truncate', value ? 'font-mono text-xs text-ink' : 'text-ink-muted')}>{value || p.choose}</span>
          <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        </button>
        {value && (
          <Button type="button" variant="outline" size="icon" onClick={() => onChange('')} aria-label={p.clear} title={p.clear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {!known && <p className="text-xs text-danger">{p.unknown}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl gap-3">
          <DialogHeader>
            <DialogTitle>{p.title}</DialogTitle>
            <DialogDescription>{fill(p.subtitle, { n: TOTAL })}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={p.searchPlaceholder} className="pl-9" aria-label={p.searchPlaceholder} />
          </div>

          <div className="h-[min(62vh,640px)] space-y-5 overflow-y-auto pr-1">
            {searching && suggested.length === 0 && others.length === 0 && <p className="border border-dashed border-line p-8 text-center text-sm text-ink-muted">{p.empty}</p>}

            {suggested.length > 0 && (
              <section className="space-y-3">
                <p className="eyebrow">{p.suggested}</p>
                {searching
                  ? grid(suggested.map((s) => s.name))
                  : byGroup(suggested).map(({ group, names }) => (
                      <div key={group} className="space-y-1.5">
                        <p className="text-xs font-medium text-ink-soft">{p.groups[group]}</p>
                        {grid(names)}
                      </div>
                    ))}
              </section>
            )}

            {others.length > 0 && (
              <section className="space-y-2">
                <p className="eyebrow">{searching ? fill(p.foundAll, { n: others.length }) : p.all}</p>
                {grid(shownOthers)}
                {shownOthers.length < others.length && (
                  <div className="flex justify-center pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowAll(true)}>
                      {fill(p.showAll, { n: others.length })}
                    </Button>
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-muted">
            <span>{p.hint}</span>
            {value && (
              <Button type="button" variant="outline" size="sm" onClick={() => choose('')}>
                <X className="h-3.5 w-3.5" /> {p.clear}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
