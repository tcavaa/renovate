/**
 * What the admin's filter bar says about a filter: a tree option's plain name, whether an
 * option answers the popover's search, and a range or a period in a few characters for the
 * filter's button ("10–50 ₾", "≥ 4.5", "01.09 – 28.09.2026"). Pure; `FilterBar` renders it.
 */

/** A category option's name without its place in the tree ("  └ Corner sofas" → "Corner sofas"). */
export function plainOptionLabel(label: string): string {
  return label.replace(/^[\s └]+/u, '').trim();
}

/** Whether an option answers the search typed over a long list. */
export function optionMatches(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || plainOptionLabel(label).toLowerCase().includes(q);
}

/** A number range as the filter's button shows it; null when neither end is set. */
export function rangeSummary(min: string, max: string, unit = ''): string | null {
  const suffix = unit ? ` ${unit}` : '';
  if (min && max) return `${min}–${max}${suffix}`;
  if (min) return `≥ ${min}${suffix}`;
  if (max) return `≤ ${max}${suffix}`;
  return null;
}

/** `2026-09-01` → `01.09.2026`; anything else as it came. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** A period as the filter's button shows it — the first day's year dropped when both ends share it. */
export function dateRangeSummary(from: string, to: string): string | null {
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${sameYear ? shortDate(from).slice(0, 5) : shortDate(from)} – ${shortDate(to)}`;
  }
  if (from) return `≥ ${shortDate(from)}`;
  if (to) return `≤ ${shortDate(to)}`;
  return null;
}
