/**
 * A lucide icon as canvas paths, so the board draws a technical point or a fitting with the
 * icon the trays, the tool rail and the inspector show it by (`icons.ts`) instead of a letter.
 *
 * lucide-react exports no drawing data: each icon's shapes — its "icon node", the SVG elements
 * of a 24 × 24 box stroked 2 wide — live inside the component (`createLucideIcon`), and are read
 * off the element its render function returns: a plain call, no React tree involved. Anything
 * unexpected there gives null, and the board keeps its letters.
 */

import type { LucideIcon } from 'lucide-react';

type IconNode = Array<[string, Record<string, string | number | undefined>]>;

const cache = new Map<LucideIcon, Path2D[] | null>();

const num = (value: string | number | undefined): number => Number(value ?? 0);

function shapeOf(tag: string, a: Record<string, string | number | undefined>): Path2D | null {
  const p = new Path2D();
  switch (tag) {
    case 'path':
      return typeof a.d === 'string' ? new Path2D(a.d) : null;
    case 'circle':
      p.arc(num(a.cx), num(a.cy), num(a.r), 0, Math.PI * 2);
      return p;
    case 'ellipse':
      p.ellipse(num(a.cx), num(a.cy), num(a.rx), num(a.ry), 0, 0, Math.PI * 2);
      return p;
    case 'rect': {
      const [x, y, w, h, rx] = [num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx ?? a.ry)];
      if (rx > 0 && typeof p.roundRect === 'function') p.roundRect(x, y, w, h, rx);
      else p.rect(x, y, w, h);
      return p;
    }
    case 'line':
      p.moveTo(num(a.x1), num(a.y1));
      p.lineTo(num(a.x2), num(a.y2));
      return p;
    case 'polyline':
    case 'polygon': {
      const values = String(a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      for (let i = 0; i + 1 < values.length; i += 2) {
        if (i === 0) p.moveTo(values[i], values[i + 1]);
        else p.lineTo(values[i], values[i + 1]);
      }
      if (tag === 'polygon') p.closePath();
      return p;
    }
    default:
      return null;
  }
}

/** The icon's shapes in its own 24 × 24 box, or null where they cannot be had (no `Path2D`: a test, the server). */
export function iconPaths(icon: LucideIcon): Path2D[] | null {
  if (typeof Path2D === 'undefined') return null;
  const known = cache.get(icon);
  if (known !== undefined) return known;
  let paths: Path2D[] | null = null;
  try {
    const render = (icon as unknown as { render?: (props: object, ref: null) => { props?: { iconNode?: IconNode } } | null }).render;
    const node = render?.({}, null)?.props?.iconNode;
    if (Array.isArray(node) && node.length > 0) {
      const shapes = node.map(([tag, attrs]) => shapeOf(tag, attrs)).filter((p): p is Path2D => p !== null);
      paths = shapes.length > 0 ? shapes : null;
    }
  } catch {
    paths = null;
  }
  cache.set(icon, paths);
  return paths;
}

/**
 * Strokes the icon `size` px square around (cx, cy), the way lucide draws it — round caps and
 * joins — in `color`. False when the icon could not be read, so the caller can draw its
 * fallback.
 */
export function strokeIcon(ctx: CanvasRenderingContext2D, icon: LucideIcon, cx: number, cy: number, size: number, color: string, lineWidth = 2): boolean {
  const paths = iconPaths(icon);
  if (!paths) return false;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of paths) ctx.stroke(path);
  ctx.restore();
  return true;
}
