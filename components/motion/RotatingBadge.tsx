import { Chevron } from '@/components/layout/Logo';

/**
 * Text running around a circle, slowly turning — the editorial "stamp" in the hero corner.
 * Pure SVG + CSS animation; `text` is repeated to fill the ring.
 */
export function RotatingBadge({ text, className }: { text: string; className?: string }) {
  const ring = `${text} · ${text} · `;
  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 200 200" className="h-full w-full animate-spin-slow">
        <defs>
          <path id="ring" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" />
        </defs>
        <text className="fill-ink-soft text-[13px] font-normal uppercase tracking-[0.32em]">
          <textPath href="#ring" startOffset="0">
            {ring}
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-bg-surface shadow-card ring-1 ring-line">
          <Chevron className="h-5 w-5 -translate-y-px text-brand" weight={0.14} />
        </span>
      </span>
    </div>
  );
}
