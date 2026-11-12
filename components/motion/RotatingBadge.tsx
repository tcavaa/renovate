/**
 * Text running around a circle, slowly turning — a sticker in the hero corner.
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
        <text className="fill-ink text-[14px] font-extrabold uppercase tracking-[0.22em]">
          <textPath href="#ring" startOffset="0">
            {ring}
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-ink">
          <span className="h-3.5 w-3.5 bg-lime" />
        </span>
      </span>
    </div>
  );
}
