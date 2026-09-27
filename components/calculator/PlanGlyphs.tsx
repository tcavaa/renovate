import type { Vec2 } from '@/lib/design/types';
import { cn } from '@/lib/utils';

/**
 * Little drawings of the plan for the catalogue step, drawn as the board draws it (x across,
 * z down): a room's outline with one of its walls picked out, and the whole flat with one of its
 * rooms picked out.
 */

/** Maps plan points into a `width` × `height` box, the drawing centred and `pad` clear of its edges. */
function fitter(points: Vec2[], width: number, height: number, pad: number): (p: Vec2) => [number, number] {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX || 1;
  const spanZ = Math.max(...zs) - minZ || 1;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanZ);
  const ox = (width - spanX * scale) / 2;
  const oz = (height - spanZ * scale) / 2;
  return (p) => [ox + (p.x - minX) * scale, oz + (p.z - minZ) * scale];
}

const pathOf = (polygon: Vec2[], at: (p: Vec2) => [number, number]) => `${polygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${at(p).join(' ')}`).join(' ')} Z`;

/** A room's outline with wall `index` (edge i, from point i to the next) picked out. */
export function WallGlyph({ outline, index, active }: { outline: Vec2[]; index: number; active: boolean }) {
  const at = fitter(outline, 24, 24, 3);
  const [ax, az] = at(outline[index] ?? outline[0]);
  const [bx, bz] = at(outline[(index + 1) % outline.length] ?? outline[0]);
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
      <path d={pathOf(outline, at)} className="fill-bg-base stroke-ink-faint" strokeWidth={1} strokeLinejoin="round" />
      <line x1={ax} y1={az} x2={bx} y2={bz} className={active ? 'stroke-ink' : 'stroke-ink-soft'} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** The flat — every room's outline, where it lies on the plan — with room `roomId` picked out. */
export function RoomGlyph({ outlines, roomId, active }: { outlines: Array<{ id: string; polygon: Vec2[] }>; roomId: string; active: boolean }) {
  if (outlines.length === 0) return null;
  const at = fitter(
    outlines.flatMap((o) => o.polygon),
    48,
    40,
    2
  );
  const own = outlines.find((o) => o.id === roomId);
  return (
    <svg viewBox="0 0 48 40" className="h-10 w-12 shrink-0" aria-hidden>
      {outlines.map((o) => (o.id === roomId ? null : <path key={o.id} d={pathOf(o.polygon, at)} className="fill-bg-base stroke-ink-faint" strokeWidth={1} strokeLinejoin="round" />))}
      {own && <path d={pathOf(own.polygon, at)} className={cn(active ? 'fill-ink stroke-ink' : 'fill-ink-soft stroke-ink-soft')} strokeWidth={1} strokeLinejoin="round" />}
    </svg>
  );
}
