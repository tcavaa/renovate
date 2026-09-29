import Link from 'next/link';
import { ChevronRight, LayoutGrid, type LucideIcon } from 'lucide-react';
import { PlanDrawing } from '@/components/projects/PlanDrawing';
import { cn } from '@/lib/utils';
import type { HubProject } from '@/lib/projects/hub';

/** One of the sidebar's lists. */
export interface HubNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * The frame the hubs (`/calculator`, `/design`) and the profile share, laid out as a file
 * manager's "my files" is: a sidebar of lists down the left — a row of the same above the page
 * below `lg` — and beside it a breadcrumb title in the serif, the parent muted ("გამომთვლელი ›
 * ჩემი პროექტები"), then the page. The profile puts the account at the head of the sidebar.
 */
export function HubShell({ label, account, items, crumb, title, children }: { label: string; account?: { name: string; email: string | null }; items: HubNavItem[]; crumb: { label: string; href: string }; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-8 lg:flex lg:gap-12 lg:py-12">
      <nav aria-label={label} className="mb-8 lg:mb-0 lg:w-56 lg:shrink-0">
        <div className="lg:sticky lg:top-24">
          {account ? (
            <div className="mb-5 flex items-center gap-3 px-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold uppercase text-white" aria-hidden>
                {account.name.trim().charAt(0) || '·'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{account.name}</span>
                {account.email && <span className="block truncate text-xs text-ink-muted">{account.email}</span>}
              </span>
            </div>
          ) : (
            <p className="mb-3 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:block">{label}</p>
          )}
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={cn('flex items-center gap-3 whitespace-nowrap rounded-[12px] px-3 py-2.5 text-[15px] font-medium transition-colors', item.active ? 'bg-sand text-ink' : 'text-ink-soft hover:bg-sand/60 hover:text-ink')}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="min-w-0 flex-1">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 font-serif text-3xl font-bold leading-tight tracking-tight md:text-[2.5rem]">
          <Link href={crumb.href} className="text-ink-faint transition-colors hover:text-ink-muted">
            {crumb.label}
          </Link>
          <ChevronRight className="h-6 w-6 shrink-0 text-ink-faint md:h-7 md:w-7" aria-hidden />
          <span className="text-ink">{title}</span>
        </h1>
        {children}
      </div>
    </div>
  );
}

/** A round coloured link with its name under it — the row of ways in over a list (a hub's buttons are its client twin). */
export function RoundLink({ href, icon, label, className }: { href: string; icon: React.ReactNode; label: string; className: string }) {
  return (
    <Link href={href} className="group flex w-36 flex-col items-center gap-2.5 text-center focus-visible:outline-none">
      <span className={cn('grid h-16 w-16 place-items-center rounded-full text-white shadow-card transition-all group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-brand/50 group-focus-visible:ring-offset-2', className)}>{icon}</span>
      <span className="text-sm font-medium leading-snug text-ink-soft transition-colors group-hover:text-ink">{label}</span>
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
    <div className={cn('flex h-full w-full items-center justify-center overflow-hidden', empty ? 'bg-sand-light' : 'bg-white', small ? 'p-0.5' : 'p-2')}>
      {empty ? <LayoutGrid className={cn('text-ink-faint', small ? 'h-5 w-5' : 'h-8 w-8')} aria-hidden /> : <PlanDrawing plan={chosen} rooms={rooms} bare={small} className="h-full w-full" />}
    </div>
  );
}

/** The frame a card's picture stands in: rounded, white, lifting on hover. */
export const CARD_FRAME = 'block aspect-[5/4] overflow-hidden rounded-[18px] border border-line bg-bg-surface transition-shadow hover:shadow-cardHover';
