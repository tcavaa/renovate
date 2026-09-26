'use client';

/**
 * One set of stores per project.
 *
 * The calculator and the studio are only ever opened *inside* a project — a named row on the
 * server, created before the first step (`POST /api/projects/create`) and opened at
 * `/calculator/<id>` or `/design/<id>`. Each project gets its own calculator store, its own
 * calculator drawing board and its own studio store, each in a localStorage key of its own
 * (`renovate-calculator:<id>`, …), so two projects can never write over each other — not two
 * tabs, not a project opened from the profile over one in progress.
 *
 * Every store hook the pages use (`useCalculatorStore`, `useDesignStore`,
 * `useCalculatorPlanStore`) is a `projectScopedStore`: as a hook it reads the store of the
 * project that is open (`useActiveProject`, set by `ProjectGate` before anything inside it
 * renders) and re-renders when that changes; `getState` / `setState` / `subscribe` reach the
 * open project's store at the moment they are called; `.for(id)` addresses one project's
 * store by id. Outside a project (the hubs, the profile, tests) the hooks reach a store kept
 * in memory only, which nothing persists.
 *
 * The server is the truth; these caches are the safety net for work the autosave has not
 * written yet (`lib/flow/projectSync`).
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';

interface ActiveProjectState {
  id: number | null;
  setId: (id: number | null) => void;
}

/** The project whose steps are open, or null outside one. Set by `ProjectGate`; not persisted. */
export const useActiveProject = create<ActiveProjectState>()((set) => ({
  id: null,
  setId: (id) => set({ id }),
}));

export const activeProjectId = (): number | null => useActiveProject.getState().id;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = UseBoundStore<StoreApi<any>>;

export interface ProjectScoped<S extends AnyStore> {
  /** The store of project `id` (created, and read back from its cache, on first use); `null` is the in-memory one. */
  for: (id: number | null) => S;
  /** The store of project `id` if this page has already made it. */
  peek: (id: number) => S | undefined;
  /** Forgets project `id`: its store in memory and its cache in localStorage. */
  drop: (id: number) => void;
  /** The localStorage key project `id`'s store is cached under. */
  storageKey: (id: number) => string;
  /** Every project id with a cache under this store's prefix. */
  cachedIds: () => number[];
  /** The prefix of this store's keys, `<prefix>:<id>`. */
  prefix: string;
}

/**
 * A store per project over `make(storageName)`; `make(null)` must return a store that is not
 * persisted. The hook form subscribes to the open project first and then to its store — the
 * same two hooks in the same order whichever project that is.
 */
export function projectScopedStore<S extends AnyStore>(prefix: string, make: (storageName: string | null) => S): S & ProjectScoped<S> {
  const stores = new Map<number, S>();
  let scratch: S | null = null;
  const storageKey = (id: number) => `${prefix}:${id}`;
  const forId = (id: number | null): S => {
    if (id == null) return (scratch ??= make(null));
    let store = stores.get(id);
    if (!store) {
      store = make(storageKey(id));
      stores.set(id, store);
    }
    return store;
  };
  const active = (): S => forId(activeProjectId());
  const hook = ((selector?: (state: unknown) => unknown) => {
    const id = useActiveProject((a) => a.id);
    const store = forId(id);
    return selector ? store(selector) : store();
  }) as unknown as S;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)$`);
  return Object.assign(hook, {
    getState: () => active().getState(),
    getInitialState: () => active().getInitialState(),
    setState: ((...args: Parameters<S['setState']>) => (active().setState as (...a: unknown[]) => void)(...args)) as S['setState'],
    subscribe: ((listener: Parameters<S['subscribe']>[0]) => active().subscribe(listener)) as S['subscribe'],
    for: forId,
    peek: (id: number) => stores.get(id),
    drop: (id: number) => {
      stores.delete(id);
      try {
        localStorage.removeItem(storageKey(id));
      } catch {
        // Storage unavailable: nothing was cached.
      }
    },
    storageKey,
    cachedIds: () => {
      const ids: number[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const match = pattern.exec(localStorage.key(i) ?? '');
          if (match) ids.push(Number(match[1]));
        }
      } catch {
        // Storage unavailable: nothing cached.
      }
      return ids;
    },
    prefix,
  });
}
