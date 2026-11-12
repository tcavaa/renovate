import { cn } from '@/lib/utils';

/**
 * The ROOMIT marks. The name is set in the grotesk at its heaviest, tight, and closes on a lime
 * square — a full stop that is also a room seen from above. On the app icon the R stands alone
 * with the square beside it.
 *
 * The wordmark is text, so it scales with the font size it is given and stays crisp;
 * `aria-label` reads it as one word.
 */

/** The lime square that closes the name. Sized in `em`, so it follows the text beside it. */
export function Dot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-[0.24em] w-[0.24em] shrink-0 bg-lime', className)} />;
}

/** ROOMIT■ — the wordmark. Size it with a text size; colour it with a text colour. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="ROOMIT" className={cn('inline-flex select-none items-baseline font-sans font-black uppercase leading-none tracking-[-0.055em]', className)}>
      <span aria-hidden>ROOMIT</span>
      <Dot className="ml-[0.07em]" />
    </span>
  );
}

const TILE = {
  ink: 'bg-ink text-white',
  lime: 'bg-lime text-ink',
  white: 'bg-white text-ink ring-1 ring-inset ring-line',
  violet: 'bg-brand text-white',
} as const;

/** The app icon: the R and the square on a rounded tile. */
export function LogoMark({ tone = 'ink', className }: { tone?: keyof typeof TILE; className?: string }) {
  return (
    <span className={cn('grid aspect-square shrink-0 place-items-center rounded-[28%]', TILE[tone], className)} aria-hidden>
      <svg viewBox="0 0 64 64" className="h-full w-full">
        <path fill="currentColor" d="M14 47V17h14.2c7 0 11.3 3.900 11.300 10 0 4.300-2.200 7.500-5.900 9L40.500 47h-8.300l-6-10h-4.700v10H14zm7.500-16.200h5.900c3 0 4.600-1.400 4.600-3.800s-1.600-3.700-4.600-3.700h-5.900v7.500z" />
        <rect x="42" y="38" width="9" height="9" className={tone === 'lime' ? 'fill-brand' : 'fill-lime'} />
      </svg>
    </span>
  );
}

/**
 * The lockup the header, the auth pages and the admin use: the wordmark, with the tagline
 * under it when one is given.
 */
export function Logo({
  tagline,
  inverted = false,
  className,
  taglineClassName,
}: {
  tagline?: string;
  taglineClassName?: string;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-col gap-1.5', className)}>
      <Wordmark className={cn('text-[26px]', inverted ? 'text-white' : 'text-ink')} />
      {tagline && (
        <span className={cn('whitespace-nowrap text-[10px] font-semibold leading-none tracking-[-0.01em]', inverted ? 'text-white/60' : 'text-ink-muted', taglineClassName)}>
          {tagline}
        </span>
      )}
    </span>
  );
}
