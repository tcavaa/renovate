import { createElement, type ReactNode } from 'react';
import { createLucideIcon, icons, type LucideIcon, type LucideProps } from 'lucide-react';
import { STUDIO_ICONS, iconLookupKey } from '@/lib/admin/icons';

/**
 * A category's (or a studio room's) icon, drawn from its stored name ('door-open', 'DoorOpen' —
 * any spelling `iconLookupKey` reduces): one of the studio's own furniture icons or lucide's,
 * or `fallback` when there is none or the name is neither.
 *
 * It carries the whole lucide set, so it is for the admin: the categories list renders it on
 * the server (no script reaches the browser) and `IconPicker`, loaded only when the category
 * form opens, in the browser.
 */

const BY_KEY = new Map<string, LucideIcon>(Object.entries(icons).map(([pascal, Icon]) => [pascal.toLowerCase(), Icon]));
/** The studio's own furniture icons, which lucide has not (`STUDIO_ICONS`), found first. */
const STUDIO = new Map<string, LucideIcon>(Object.entries(STUDIO_ICONS).map(([name, node]) => [iconLookupKey(name), createLucideIcon(name, node as Parameters<typeof createLucideIcon>[1])]));

export function lucideIconFor(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  const key = iconLookupKey(name);
  return STUDIO.get(key) ?? BY_KEY.get(key) ?? null;
}

export function CategoryIcon({ icon, fallback = null, ...props }: Omit<LucideProps, 'ref'> & { icon: string | null | undefined; fallback?: ReactNode }) {
  const Icon = lucideIconFor(icon);
  // The icon is one of lucide's own components, looked up — not one made here.
  return Icon ? createElement(Icon, { 'aria-hidden': true, ...props }) : <>{fallback}</>;
}
