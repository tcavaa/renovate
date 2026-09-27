import { createElement } from 'react';
import type { IconNode } from '@/lib/admin/icons';
import { cn } from '@/lib/utils';

/** The SVG elements an icon drawing may use — anything else in a node is skipped. */
const SVG_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g']);

/**
 * An icon from its drawing (`IconNode`) — what the server sends in place of a component, so a
 * page can show the icons admin chose without shipping an icon set (`lib/catalog/iconNodes`).
 * Drawn the way lucide draws: 24 × 24, stroked in the current colour.
 */
export function NodeIcon({ node, className, strokeWidth = 2 }: { node: IconNode; className?: string; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={cn('shrink-0', className)} aria-hidden>
      {node.map(([tag, attrs], i) => (SVG_TAGS.has(tag) ? createElement(tag, { ...attrs, key: attrs.key ?? i }) : null))}
    </svg>
  );
}
