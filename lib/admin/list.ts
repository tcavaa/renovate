/**
 * URL-driven list state for the admin tables.
 *
 * Every admin list is a server component that reads its filters, sort and page from the
 * query string, so a filtered view has a URL that can be bookmarked or sent to a colleague,
 * and the browser's back button does what people expect. This module is the one place that
 * parses and rebuilds that query string.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListParams<Sort extends string = string> {
  q: string;
  page: number;
  pageSize: number;
  sort: Sort;
  dir: 'asc' | 'desc';
  /** Every parameter as a flat string map (first value wins). */
  raw: Record<string, string>;
  /** A filter value, trimmed; empty string when absent. */
  get(name: string): string;
  /** A numeric filter, or `null` when absent or not a number. */
  num(name: string): number | null;
  /** True when anything besides sort and page is set. */
  hasFilters: boolean;
}

export const DEFAULT_PAGE_SIZE = 25;

export function parseListParams<Sort extends string>(
  searchParams: SearchParams,
  options: { sorts: readonly Sort[]; defaultSort: Sort; defaultDir?: 'asc' | 'desc'; pageSize?: number }
): ListParams<Sort> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.trim() !== '') raw[key] = first.trim();
  }

  const get = (name: string) => raw[name] ?? '';
  const num = (name: string) => {
    if (!(name in raw)) return null;
    const n = Number(raw[name]);
    return Number.isFinite(n) ? n : null;
  };

  const sort = (options.sorts as readonly string[]).includes(raw.sort) ? (raw.sort as Sort) : options.defaultSort;
  const dir = raw.dir === 'asc' || raw.dir === 'desc' ? raw.dir : options.defaultDir ?? 'desc';
  const page = Math.max(1, Math.floor(num('page') ?? 1));
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const hasFilters = Object.keys(raw).some((k) => !['sort', 'dir', 'page'].includes(k));

  return { q: get('q'), page, pageSize, sort, dir, raw, get, num, hasFilters };
}

/** The current query string with some keys changed; `undefined` or `''` removes a key. */
export function hrefWith(pathname: string, raw: Record<string, string>, patch: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** `showing {from}–{to} of {total}` filled in. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function pageWindow(page: number, pageCount: number, width = 5): number[] {
  const half = Math.floor(width / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(pageCount, start + width - 1);
  start = Math.max(1, end - width + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}
