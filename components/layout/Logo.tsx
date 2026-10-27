import { cn } from '@/lib/utils';

/**
 * The PLAYCE marks. The brand's A is an open chevron — a roof, a corner of a room — with no
 * crossbar: in the wordmark it stands in for the letter, on the app icon it stands alone on a
 * rounded tile (sand, terracotta or olive, as on the brand board).
 *
 * The wordmark is text in the brand sans (Jost) with the chevron drawn in, so it scales with
 * the font size it is given and stays crisp; `aria-label` reads it as one word.
 */

/** The chevron alone, drawn in `currentColor`. `weight` is the stroke as a share of its height. */
export function Chevron({ className, weight = 0.11 }: { className?: string; weight?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none">
      <path d="M8 96 L50 6 L92 96" stroke="currentColor" strokeWidth={weight * 100} strokeLinejoin="miter" strokeMiterlimit={10} />
    </svg>
  );
}

/** PLΛYCE — the wordmark. Size it with a text size; colour it with a text colour. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="PLAYCE" className={cn('inline-flex select-none items-baseline font-sans font-normal uppercase leading-none tracking-[0.3em]', className)}>
      <span aria-hidden>PL</span>
      <Chevron className="mr-[0.3em] h-[0.72em] w-[0.7em] self-baseline translate-y-[0.02em]" weight={0.1} />
      <span aria-hidden className="-mr-[0.3em]">YCE</span>
    </span>
  );
}

const TILE = {
  sand: 'bg-sand-light text-ink ring-1 ring-inset ring-line',
  terracotta: 'bg-brand text-white',
  olive: 'bg-olive text-sand-light',
  ink: 'bg-ink text-white',
} as const;

/** The app icon: the chevron on a rounded tile. */
export function LogoMark({ tone = 'terracotta', className }: { tone?: keyof typeof TILE; className?: string }) {
  return (
    <span className={cn('grid aspect-square shrink-0 place-items-center rounded-[28%]', TILE[tone], className)} aria-hidden>
      <Chevron className="h-[46%] w-[46%] -translate-y-[4%]" weight={0.2} />
    </span>
  );
}

/**
 * The lockup the header, the auth pages and the admin use: the tile and the wordmark, with the
 * tagline spaced under it when there is room for it.
 */
export function Logo({
  tagline,
  tone = 'terracotta',
  inverted = false,
  className,
  taglineClassName,
}: {
  tagline?: string;
  taglineClassName?: string;
  tone?: keyof typeof TILE;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <LogoMark tone={tone} className="h-9 w-9" />
      <span className="flex flex-col gap-1">
        <Wordmark className={cn('text-[19px]', inverted ? 'text-white' : 'text-ink')} />
        {tagline && (
          <span className={cn('whitespace-nowrap text-[8.5px] font-medium uppercase leading-none tracking-[0.34em]', inverted ? 'text-white/55' : 'text-ink-muted', taglineClassName)}>
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}
