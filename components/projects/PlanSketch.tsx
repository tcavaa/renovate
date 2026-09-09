import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { formatM2 } from '@/lib/utils';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';

/**
 * A saved project's layout as a static drawing: the plan's own outlines when it has one,
 * otherwise the rooms at the positions the layout editor gave them (or a strip when they
 * were typed before positions existed). Server-safe SVG, metres as units.
 */
export function PlanSketch({ plan, rooms, className }: { plan: FloorPlan | null; rooms: Room[]; className?: string }) {
  const source = plan && plan.rooms.length > 0 ? plan : rooms.length > 0 ? planFromCalculatorRooms(rooms) : null;
  if (!source) return null;
  const pts = source.rooms.flatMap((r) => r.polygon);
  const minX = Math.min(...pts.map((p) => p.x));
  const minZ = Math.min(...pts.map((p) => p.z));
  const maxX = Math.max(...pts.map((p) => p.x));
  const maxZ = Math.max(...pts.map((p) => p.z));
  const pad = 0.6;
  const w = maxX - minX + pad * 2;
  const d = maxZ - minZ + pad * 2;
  const wet = new Set(['bathroom', 'toilet', 'kitchen']);

  return (
    <svg viewBox={`${minX - pad} ${minZ - pad} ${w} ${d}`} className={className} style={{ aspectRatio: `${w} / ${d}` }} role="img">
      {source.rooms.map((room) => {
        const points = room.polygon.map((p) => `${p.x},${p.z}`).join(' ');
        const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
        const cz = room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length;
        const xs = room.polygon.map((p) => p.x);
        const width = Math.max(...xs) - Math.min(...xs);
        const fs = Math.max(0.22, Math.min(0.38, width / 10));
        return (
          <g key={room.id}>
            <polygon points={points} fill={wet.has(room.type) ? 'rgba(110,150,190,0.14)' : 'rgba(233,226,216,0.7)'} stroke="#161513" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="miter" />
            <text x={cx} y={cz - fs * 0.15} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#161513">
              {room.name}
            </text>
            <text x={cx} y={cz + fs * 1.05} textAnchor="middle" fontSize={fs * 0.72} fill="#6F6A63">
              {formatM2(room.areaM2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
