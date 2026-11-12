/**
 * The parts of an action tile — one way in over a list (a new project, the other product's half,
 * a hub): a rounded block with a white icon tile, a numbered name and a line about it. Shared by
 * the hubs' buttons (client) and the profile's links (server), so it has nothing but markup.
 */

/** How an action tile looks: the first of a row stands on lime, the rest on grey. */
export const ACTION_TILE = {
  lime: 'bg-lime-soft ring-1 ring-inset ring-lime hover:bg-lime',
  mist: 'bg-mist-light hover:bg-mist',
} as const;

/** The inside of an action tile: a white icon tile, the numbered name, a line about it. */
export function ActionTileBody({ n, icon, label, note }: { n?: number; icon: React.ReactNode; label: string; note?: string }) {
  return (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-bg-surface text-ink shadow-card">{icon}</span>
      <span className="mt-4 block text-[15px] font-bold leading-snug tracking-tight text-ink">
        {n != null && <span className="tabular-nums">{n}. </span>}
        {label}
      </span>
      {note && <span className="mt-1 line-clamp-2 block text-sm leading-snug text-ink-muted group-hover:text-ink-soft">{note}</span>}
    </>
  );
}

/** The frame of an action tile — a rounded block that is one way in over a list. */
export const ACTION_TILE_FRAME = 'group flex w-full flex-col items-start rounded-2xl p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:w-60';
