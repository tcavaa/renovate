import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storedValue } from '@/lib/admin/storageStore';
import { listHref, rememberList, rememberedListHref } from '@/lib/admin/listMemory';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { ka } from '@/lib/i18n/ka';

/** A storage that can be told to refuse, like a private window's. */
class FakeStorage {
  items = new Map<string, string>();
  refuse = false;
  getItem(key: string) {
    if (this.refuse) throw new Error('refused');
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.refuse) throw new Error('refused');
    this.items.set(key, value);
  }
}

let session: FakeStorage;
let local: FakeStorage;
const g = globalThis as unknown as { window?: unknown };

beforeEach(() => {
  session = new FakeStorage();
  local = new FakeStorage();
  g.window = { sessionStorage: session, localStorage: local };
});
afterEach(() => {
  delete g.window;
});

describe('a value kept in the browser', () => {
  it('reads what is stored, the fallback when nothing or garbage is', () => {
    local.items.set('ids', '[1,2,"x"]');
    const ids = storedValue<number[] | null>('local', 'ids', (raw) => (Array.isArray(raw) ? raw.filter((x): x is number => typeof x === 'number') : null), null);
    expect(ids.get()).toEqual([1, 2]);
    session.items.set('broken', '{not json');
    expect(storedValue('session', 'broken', (raw) => raw as string, 'fallback').get()).toBe('fallback');
    expect(storedValue('session', 'missing', (raw) => raw as string, 'fallback').get()).toBe('fallback');
  });

  it('writes through, tells its readers, and keeps the value for the page when storage refuses', () => {
    const open = storedValue<number[] | null>('local', 'open', (raw) => (Array.isArray(raw) ? (raw as number[]) : null), null);
    let told = 0;
    const stop = open.subscribe(() => told++);
    open.set([3]);
    expect(local.items.get('open')).toBe('[3]');
    expect(told).toBe(1);
    local.refuse = true;
    open.set([4, 5]);
    expect(open.get()).toEqual([4, 5]);
    expect(told).toBe(2);
    stop();
    open.set([]);
    expect(told).toBe(2);
  });

  it('is the fallback on the server, where there is no window', () => {
    delete g.window;
    const value = storedValue('session', 'anything', (raw) => raw as string, 'server');
    expect(value.get()).toBe('server');
  });
});

describe('where each list was left', () => {
  it('links a list back with the query it was left with, unless the link says otherwise', () => {
    const memory = { '/admin/products': 'category=3&status=active&page=2' };
    expect(listHref(memory, '/admin/products')).toBe('/admin/products?category=3&status=active&page=2');
    expect(listHref(memory, '/admin/stores')).toBe('/admin/stores');
    // A dashboard figure pointing at a view goes where it says.
    expect(listHref(memory, '/admin/products?model=none')).toBe('/admin/products?model=none');
  });

  it('remembers a list as it changes, and forgets it when nothing is set', () => {
    rememberList('/admin/orders', 'review=pending&dateFrom=2026-09-01');
    expect(rememberedListHref('/admin/orders')).toBe('/admin/orders?review=pending&dateFrom=2026-09-01');
    expect(JSON.parse(session.items.get('renovate-admin-lists') ?? '{}')).toEqual({ '/admin/orders': 'review=pending&dateFrom=2026-09-01' });
    rememberList('/admin/orders', '');
    expect(rememberedListHref('/admin/orders')).toBe('/admin/orders');
  });
});

describe('the breadcrumbs', () => {
  it('names a section once and links back to its list, or is the page itself', () => {
    expect(sectionCrumb(ka, 'products')).toEqual({ label: ka.admin.products, href: '/admin/products', list: true });
    expect(sectionCrumb(ka, 'shelfRooms')).toEqual({ label: ka.admin.shelfRooms.tab, href: '/admin/categories/rooms', list: true });
    expect(sectionCrumb(ka, 'orders', true)).toEqual({ label: ka.admin.ordersPage.title });
  });
});
