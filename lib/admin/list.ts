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

/**
 * A page's rows back in the order of its ids. A list of projects has MySQL sort and cut the
 * page on the ids alone, then reads those rows by id (`inArray`, which answers in no particular
 * order): a sort carries every column the select reads through MySQL's sort buffer, and a
 * project's plan or picks can overflow it ("Out of sort memory" — docs/data-model.md). An id
 * whose row is gone by the second read is left out.
 */
export function inIdOrder<T extends { id: number }>(ids: readonly number[], rows: readonly T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
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

/**
 * The `dateFrom` / `dateTo` filter of an admin list (`YYYY-MM-DD`, as the date inputs write
 * them), as the first and last instant of those days in Tbilisi. Anything else is no bound: a
 * hand-edited `?dateFrom=x` made an Invalid Date that crashed the page's query. It was copied
 * into three pages; this is the one.
 */
export function dateRange(p: Pick<ListParams, 'get'>): { from: Date | null; to: Date | null } {
  const day = (value: string, end: boolean): Date | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}+04:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  return { from: day(p.get('dateFrom'), false), to: day(p.get('dateTo'), true) };
}
