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
        <text className="fill-ink-muted text-[13px] font-medium uppercase tracking-[0.32em]">
          <textPath href="#ring" startOffset="0">
            {ring}
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 4v16m0 0-6-6m6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
