/**
 * A value kept in the browser's storage, read as an external store (`useSyncExternalStore`):
 * the server and the first render see the fallback, the browser what is stored, and every
 * component reading it re-renders when it is written — the sidebar's links change the moment a
 * list's filters do.
 *
 * Storage can be missing or refuse (a private window, blocked site data), so every read and
 * write is guarded: what was written is still kept for the life of the page, only not beyond
 * it. Read once per page and held in memory after that — the admin lists and the category tree
 * are the only writers.
 */

export interface StoredValue<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
  /** What the server renders with, and what a browser with nothing stored reads. */
  readonly fallback: T;
}

export function storedValue<T>(kind: 'session' | 'local', key: string, parse: (raw: unknown) => T | null, fallback: T): StoredValue<T> {
  const listeners = new Set<() => void>();
  let loaded = false;
  let value = fallback;

  const storage = (): Storage | null => {
    if (typeof window === 'undefined') return null;
    try {
      return kind === 'session' ? window.sessionStorage : window.localStorage;
    } catch {
      return null;
    }
  };

  return {
    fallback,
    get() {
      if (typeof window === 'undefined') return fallback;
      if (!loaded) {
        loaded = true;
        try {
          const raw = storage()?.getItem(key);
          value = raw == null ? fallback : (parse(JSON.parse(raw)) ?? fallback);
        } catch {
          value = fallback;
        }
      }
      return value;
    },
    set(next) {
      loaded = true;
      value = next;
      try {
        storage()?.setItem(key, JSON.stringify(next));
      } catch {
        // Storage refused: the value lives until the page is left.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
