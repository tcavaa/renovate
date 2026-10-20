'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import { optionHaystack, searchOptions, type OptionHit, type SearchOption } from '@/lib/optionSearch';

export interface ComboboxOption extends SearchOption {
  /** What the closed box shows when this option is chosen (a category's whole path); the label otherwise. */
  selectedLabel?: string;
  /** A quieter word at the end of the row — a key, a code. */
  hint?: string;
}

interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboboxOption[];
  /** The closed box's text while nothing is chosen. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** For a `<Label htmlFor>`, which then names the box. */
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

/** How far PageUp / PageDown move through the list. */
const PAGE = 8;

/** The first option that matches what was typed (a parent shown only for context is skipped). */
function firstMatch(hits: ReadonlyArray<OptionHit<ComboboxOption>>): number {
  return Math.max(0, hits.findIndex((hit) => hit.match));
}

/**
 * A select with a search box: the list opens under the box with the search focused, typing
 * filters it (`lib/optionSearch.ts` — the label, the option's other words, the label in Latin
 * letters; a tree's match keeps its parents), the arrow keys and PageUp / PageDown move, Enter
 * chooses, Escape and Tab close. Typing on the closed box opens it with that letter. Built on
 * Radix's popover, so it is portalled, kept in the window and closes on a click outside; on a
 * phone the rows are taller and the search is 16 px (iOS zooms into anything smaller).
 */
export function Combobox({ value, onValueChange, options, placeholder, searchPlaceholder, id, 'aria-label': ariaLabel, disabled, className }: ComboboxProps) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  /** Scroll the chosen option to the middle once, as the list opens. */
  const centre = React.useRef(false);
  const listId = React.useId();
  const haystacks = React.useMemo(() => options.map(optionHaystack), [options]);
  const hits = React.useMemo(() => searchOptions(options, query, haystacks), [options, query, haystacks]);
  const selected = options.find((o) => o.value === value);
  const optionId = (index: number) => `${listId}-${index}`;

  const openWith = (seed: string) => {
    setQuery(seed);
    setActive(seed ? firstMatch(searchOptions(options, seed, haystacks)) : Math.max(0, options.findIndex((o) => o.value === value)));
    centre.current = !seed;
    setOpen(true);
  };
  const changeOpen = (next: boolean) => {
    if (next) openWith('');
    else setOpen(false);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    setActive(firstMatch(searchOptions(options, next, haystacks)));
  };
  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };
  const move = (by: number) => setActive((at) => Math.min(Math.max(at + by, 0), Math.max(hits.length - 1, 0)));

  // The active option kept in view inside the list (not `scrollIntoView`: that scrolls the page
  // too, and the list is still off-screen for a moment while the popover places itself).
  React.useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !box || !row) return;
    if (centre.current) {
      centre.current = false;
      box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
    } else if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [active, open, hits]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open || disabled) return;
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault();
      openWith('');
      return;
    }
    // A letter typed on the closed box starts the search with it (Space and Enter open it as a button does).
    if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openWith(event.key);
    }
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.code) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        move(PAGE);
        break;
      case 'PageUp':
        event.preventDefault();
        move(-PAGE);
        break;
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault();
        if (hits[active]) choose(hits[active].option.value);
        break;
      case 'Tab':
        // Back to the box, unchanged; the next Tab goes on through the form.
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-none border border-line bg-bg-surface px-3 py-2 text-left text-sm',
            'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 data-[state=open]:border-brand',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-ink-muted')}>{selected ? (selected.selectedLabel ?? selected.label) : placeholder}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            // The search, not the first focusable thing; the caret after a letter typed on the box.
            event.preventDefault();
            const field = input.current;
            if (!field) return;
            field.focus({ preventScroll: true });
            field.setSelectionRange(field.value.length, field.value.length);
          }}
          className={cn(
            'z-50 flex max-h-[min(26rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col',
            'border border-line bg-bg-surface text-ink shadow-cardHover outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0'
          )}
        >
          <div className="relative shrink-0 border-b border-line p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref={input}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={hits[active] ? optionId(active) : undefined}
              aria-label={ariaLabel ?? searchPlaceholder ?? t.common.typeToSearch}
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder ?? t.common.typeToSearch}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-9 w-full border border-line bg-bg-base pl-8 pr-2 text-base text-ink placeholder:text-ink-muted focus:border-ink focus:bg-bg-surface focus:outline-none sm:text-sm"
            />
          </div>
          <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {hits.map((hit, index) => {
              const { option } = hit;
              const depth = option.depth ?? 0;
              const isChosen = option.value === value;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isChosen}
                  data-index={index}
                  // The search keeps the focus; a row is chosen on click.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => index !== active && setActive(index)}
                  onClick={() => choose(option.value)}
                  style={{ paddingLeft: `${0.5 + depth}rem` }}
                  className={cn(
                    'flex cursor-pointer select-none items-center gap-2 py-2.5 pr-3 text-sm sm:py-1.5',
                    index === active && 'bg-bg-base',
                    isChosen ? 'font-semibold text-ink' : hit.match ? 'text-ink-soft' : 'text-ink-muted'
                  )}
                >
                  <span className="grid w-4 shrink-0 place-items-center">{isChosen && <Check className="h-4 w-4 text-brand" />}</span>
                  {depth > 0 && (
                    <span aria-hidden className="shrink-0 text-ink-faint">
                      └
                    </span>
                  )}
                  <span className="min-w-0 flex-1 break-words">{option.label}</span>
                  {option.hint && <span className="shrink-0 font-mono text-xs font-normal text-ink-muted">{option.hint}</span>}
                </li>
              );
            })}
          </ul>
          {hits.length === 0 && <p className="px-3 py-3 text-sm text-ink-muted">{t.common.noMatches}</p>}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
