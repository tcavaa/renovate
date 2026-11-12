import Link from 'next/link';
import { ChevronRight, LayoutGrid, type LucideIcon } from 'lucide-react';
import { PlanDrawing } from '@/components/projects/PlanDrawing';
import { cn } from '@/lib/utils';
import { ACTION_TILE, ACTION_TILE_FRAME, ActionTileBody } from '@/components/projects/hub/ActionTile';
import type { HubProject } from '@/lib/projects/hub';

/** One of the sidebar's lists. */
export interface HubNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * The frame the hubs (`/calculator`, `/design`) and the profile share, laid out as an app's
 * shell is: a rail of lists down the left — an icon over its name, the open one on a lime tile;
 * a row of the same above the page below `lg` — and beside it a heavy breadcrumb title, the
 * parent muted ("გამომთვლელი › ჩემი პროექტები"), then the page. The profile puts the account at
 * the head of the rail.
 */
export function HubShell({ label, account, items, crumb, title, children }: { label: string; account?: { name: string; email: string | null; href?: string }; items: HubNavItem[]; crumb: { label: string; href: string }; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-8 lg:flex lg:gap-10 lg:py-12">
      <nav aria-label={label} className="mb-8 lg:mb-0 lg:w-28 lg:shrink-0">
        <div className="lg:sticky lg:top-24">
          {account ? (
            <AccountHead account={account} />
          ) : (
            <p className="eyebrow mb-3 hidden text-center lg:block">{label}</p>
          )}
          <ul className="flex gap-1.5 overflow-x-auto lg:flex-col">
            {items.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={cn(
                    'flex min-w-[5.5rem] flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight text-ink transition-colors lg:py-3.5',
                    item.active ? 'bg-lime' : 'hover:bg-mist-light'
                  )}
                >
                  <item.icon className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="min-w-0 flex-1">
        <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-4xl leading-none md:text-5xl">
          <Link href={crumb.href} className="text-ink-faint transition-colors hover:text-ink-muted">
            {crumb.label}
          </Link>
          <ChevronRight className="h-7 w-7 shrink-0 text-ink-faint md:h-9 md:w-9" strokeWidth={2.5} aria-hidden />
          <span className="text-ink">{title}</span>
        </h1>
        {children}
      </div>
    </div>
  );
}

/** The account at the head of the profile's rail: its initial, name and e-mail — a link to its details when given one. */
function AccountHead({ account }: { account: { name: string; email: string | null; href?: string } }) {
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-sm font-extrabold uppercase text-lime" aria-hidden>
        {account.name.trim().charAt(0) || '·'}
      </span>
      <span className="min-w-0 lg:w-full">
        <span className="block truncate text-sm font-bold text-ink">{account.name}</span>
        {account.email && <span className="block truncate text-xs text-ink-muted lg:text-[11px]">{account.email}</span>}
      </span>
    </>
  );
  const frame = 'mb-4 flex items-center gap-3 rounded-2xl px-2 py-2 lg:flex-col lg:gap-2 lg:text-center';
  return account.href ? (
    <Link href={account.href} className={cn(frame, 'transition-colors hover:bg-mist-light')}>
      {inner}
    </Link>
  ) : (
    <div className={frame}>{inner}</div>
  );
}

/** A tile that is a link, with its name in it — the row of ways in over a list (a hub's buttons are its client twin). */
export function RoundLink({ href, icon, label, n, tone = 'mist' }: { href: string; icon: React.ReactNode; label: string; n?: number; tone?: keyof typeof ACTION_TILE }) {
  return (
    <Link href={href} className={cn(ACTION_TILE_FRAME, ACTION_TILE[tone])}>
      <ActionTileBody n={n} icon={icon} label={label} />
    </Link>
  );
}

/**
 * A project's plan as its picture, from whichever half comes first: the calculator's own
 * board, or the 3D design's plan, then the typed rooms — drawn as the PDF sheet is, the walls,
 * doors and windows with each room's area and the sizes outside (`PlanDrawing`); `small` is
 * the walls alone. Nothing drawn yet is an empty sheet.
 */
export function ProjectThumbnail({ project, prefer, small = false }: { project: HubProject; prefer: 'calculator' | 'design'; small?: boolean }) {
  const { plan, boardPlan, rooms } = project.thumbnail;
  const hasRooms = (p: typeof plan) => (p?.rooms?.length ?? 0) > 0;
  const chosen = prefer === 'calculator' ? (hasRooms(boardPlan) ? boardPlan : hasRooms(plan) ? plan : null) : hasRooms(plan) ? plan : hasRooms(boardPlan) ? boardPlan : null;
  // PlanDrawing draws nothing when there are no rooms: the same rule decides the empty sheet.
  const empty = !chosen && rooms.length === 0;
  return (
    <div className={cn('flex h-full w-full items-center justify-center overflow-hidden bg-mist-light', small ? 'p-0.5' : 'p-3')}>
      {empty ? <LayoutGrid className={cn('text-ink-faint', small ? 'h-5 w-5' : 'h-8 w-8')} aria-hidden /> : <PlanDrawing plan={chosen} rooms={rooms} bare={small} className="h-full w-full" />}
    </div>
  );
}

/** A project's card: a white rounded frame, the picture in it, the name under it. */
export const CARD = 'rounded-2xl border border-line bg-bg-surface p-2.5 transition-shadow hover:shadow-cardHover';

/** The frame a card's picture stands in: rounded, on grey. */
export const CARD_FRAME = 'block aspect-[5/4] overflow-hidden rounded-xl bg-mist-light';

/** The words under a card's picture. */
export const CARD_TEXT = 'flex items-start justify-between gap-3 px-2 pb-1.5 pt-3.5';
