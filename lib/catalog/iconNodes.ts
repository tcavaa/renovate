import { icons } from 'lucide-react';
import { STUDIO_ICONS, iconLookupKey, type IconNode } from '@/lib/admin/icons';

/**
 * An icon's drawing by the name a category or a studio room stores — the studio's own
 * furniture icons first, then lucide's — for what the server sends where a whole icon set
 * would be too much to ship: the studio's shelf gets the few drawings it shows, not lucide.
 * Null for a name that is neither.
 */

const STUDIO = new Map(Object.entries(STUDIO_ICONS).map(([name, node]) => [iconLookupKey(name), node]));
const LUCIDE = new Map<string, unknown>(Object.entries(icons).map(([pascal, component]) => [pascal.toLowerCase(), component]));
const memo = new Map<string, IconNode | null>();

type ForwardRefIcon = { render?: (props: object, ref: null) => { props?: { iconNode?: unknown } } };

export function iconNodeFor(name: string | null | undefined): IconNode | null {
  if (!name) return null;
  const key = iconLookupKey(name);
  if (memo.has(key)) return memo.get(key)!;
  // lucide's components are forwardRef wrappers that render its base icon with the drawing as
  // `iconNode`: calling the wrapper reads the drawing without rendering anything.
  const lucide = (LUCIDE.get(key) as ForwardRefIcon | undefined)?.render?.({}, null)?.props?.iconNode;
  const node = STUDIO.get(key) ?? (Array.isArray(lucide) ? (lucide as IconNode) : null);
  memo.set(key, node);
  return node;
}
