/**
 * Where each admin list was left: its filters, sort and page, remembered for the browser tab.
 *
 * A list's state lives in its URL (`lib/admin/list.ts`), and a detail page is another URL —
 * so opening a product from a filtered list and coming back by any other road than the browser's
 * own back button (the breadcrumb, the sidebar, the form's save or delete) used to land on the
 * whole list again, page one. Every list writes its query string here as it changes (the
 * `FilterBar` does it, `RememberList` for a list without one), and every link back to a list
 * reads it: `listHref`. A link that already says what to show (a dashboard figure pointing at
 * `?model=none`) goes where it says, and that view becomes the one remembered.
 *
 * Session storage: a new tab, or tomorrow, starts on the whole list.
 */

import { useSyncExternalStore } from 'react';
import { storedValue } from './storageStore';

/** A list's path → its query string, without the `?`. */
export type ListMemory = Readonly<Record<string, string>>;

const EMPTY: ListMemory = Object.freeze({});

const store = storedValue<ListMemory>(
  'session',
  'renovate-admin-lists',
  (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : null),
  EMPTY
);

/** The list at `pathname` now shows `query`; an empty query is the whole list and forgets it. */
export function rememberList(pathname: string, query: string): void {
  const memory = store.get();
  if ((memory[pathname] ?? '') === query) return;
  const next: Record<string, string> = { ...memory };
  if (query) next[pathname] = query;
  else delete next[pathname];
  store.set(next);
}

/** The link to a list as it was left — unless the link already carries a query of its own. */
export function listHref(memory: ListMemory, href: string): string {
  if (href.includes('?')) return href;
  const query = memory[href];
  return query ? `${href}?${query}` : href;
}

/** `listHref` with what is remembered right now — for a redirect after a save or a delete. */
export function rememberedListHref(href: string): string {
  return listHref(store.get(), href);
}

/** The remembered lists, for links that follow them (the sidebar, the breadcrumbs). */
export function useListMemory(): ListMemory {
  return useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
}
