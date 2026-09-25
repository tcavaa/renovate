'use client';

/**
 * The frame of a step that is a workspace — the 2D board, the 3D studio — and the parts that
 * float over it.
 *
 * From `lg` up such a step is the whole window, the way a design app is: the header and the
 * step strip stand at the top and never move (`.site-shell:has([data-flow-workspace])` in
 * `app/globals.css` takes the page's scroll and its footer away), the sheet fills everything
 * under them edge to edge, and the step's own parts float over it — its title and the way on
 * along the top (`FlowBar`), its cards down the right (`FlowPanel`), the board's tools down
 * the left and along the bottom (`PlanWorkspace` with `bleed`). Below `lg` the same parts
 * stack into an ordinary page: the step's usual head, the board, the cards under it and the
 * `StepNav` at the bottom — the page renders both heads and each hides at the other size.
 *
 * Whatever floats over an edge of the board says so with `data-board-edge`, and the board
 * frames a plan in what is left of the sheet.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowUpRight, ChevronDown, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { stageBriefRows } from '@/components/flow/StageBrief';
import type { StudioStep } from '@/store/designStore';

/**
 * Where a full-screen board's own chrome may start (`PlanWorkspace`'s `bleed`), in px from its
 * edges: under the `FlowBar` (16 px down, 56 px tall, 16 px of air), and left of the
 * `FlowPanel` (340 px wide, 16 px in from the edge, 12 px of air). Change them with those.
 */
export const FLOW_BOARD_BLEED = { top: 88, right: 368 } as const;
/** The same, for a step with no panel down the right. */
export const FLOW_BOARD_BLEED_NO_PANEL = { top: 88, right: 16 } as const;

/** The step itself: the whole window under the header and the step strip from `lg` up. */
export function FlowWorkspace({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-flow-workspace className={cn('relative lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:bg-[#FBFAF7]', className)}>
      {children}
    </div>
  );
}

export interface FlowNext {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

/**
 * The top of a full-screen step (`lg` up only; below it the page shows its `StepHeader` and
 * `StepNav`): the way back as an arrow, the step's number and title — which open what the step
 * is for, and on the design's steps the five lines of its brief — the step's own actions, and
 * the way on. A message that has to be seen before going on (`notice`) hangs under the button.
 */
export function FlowBar({ step, total, title, subtitle, brief, back, actions, next, notice }: { step: number; total: number; title: string; subtitle?: string; /** The design step whose five lines (`StageBrief`) the title opens. */ brief?: StudioStep; back?: { href: string; label: string }; actions?: React.ReactNode; next?: FlowNext; notice?: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const hasMore = !!subtitle || brief != null;

  // The drop-down goes the way a menu does: a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div data-board-edge="top" className="pointer-events-none absolute inset-x-4 top-4 z-30 hidden items-center justify-between gap-3 lg:flex">
      <div ref={anchor} className="pointer-events-auto relative flex min-w-0 items-center gap-2">
        {back && (
          <Link href={back.href} title={back.label} aria-label={back.label} className="grid h-14 w-11 shrink-0 place-items-center rounded-[14px] bg-white/90 text-ink-soft shadow-glass backdrop-blur-xl transition-colors hover:bg-white hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => hasMore && setOpen((v) => !v)}
          aria-expanded={hasMore ? open : undefined}
          title={subtitle}
          className={cn('flex h-14 min-w-0 items-center gap-3 rounded-[14px] bg-white/90 pl-4 text-left shadow-glass backdrop-blur-xl transition-colors', hasMore ? 'pr-3 hover:bg-white' : 'cursor-default pr-4')}
        >
          <span className="min-w-0">
            <span className="eyebrow block leading-none">
              {t.common.step} <span className="tabular-nums text-ink">{String(step).padStart(2, '0')}</span>
              <span className="text-ink-faint"> / {String(total).padStart(2, '0')}</span>
            </span>
            <span className="mt-1.5 block truncate font-serif text-lg font-semibold leading-tight text-ink">{title}</span>
          </span>
          {hasMore && <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} />}
        </button>
        {open && (
          <div className="absolute left-0 top-full z-10 mt-2 w-[min(40rem,calc(100vw-2rem))] rounded-[16px] border border-line bg-white p-4 shadow-cardHover animate-fade-in">
            {subtitle && <p className="text-sm leading-relaxed text-ink-soft">{subtitle}</p>}
            {brief != null && (
              <>
                <p className={cn('text-sm font-semibold text-ink', subtitle && 'mt-4 border-t border-line pt-3')}>{t.build.briefToggle}</p>
                <dl className="mt-2 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                  {stageBriefRows(t, brief).map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
                      <dd className="leading-relaxed text-ink-soft">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-auto relative flex shrink-0 items-center gap-2">
        {actions}
        {next && <FlowNextButton next={next} />}
        {notice && (
          <p role="alert" aria-live="polite" className="absolute right-0 top-full mt-2 flex w-max max-w-sm items-center gap-2 rounded-[10px] border border-danger/40 bg-white/95 px-3 py-2 text-xs font-medium text-danger shadow-glass backdrop-blur">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

function FlowNextButton({ next }: { next: FlowNext }) {
  const className = 'group inline-flex h-11 items-center gap-2 rounded-[12px] bg-ink pl-4 pr-3 text-sm font-medium text-white shadow-float transition-colors hover:bg-brand disabled:pointer-events-none disabled:opacity-50';
  const inner = (
    <>
      {next.label}
      {next.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : next.icon ?? <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
    </>
  );
  return next.href && !next.disabled ? (
    <Link href={next.href} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={next.onClick} disabled={next.disabled || next.loading} className={className}>
      {inner}
    </button>
  );
}

/** A plain action for the bar, beside the way on: an icon, and its words where there is room. */
export function FlowBarButton({ icon, label, title, onClick }: { icon: React.ReactNode; label: string; title?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title ?? label} aria-label={label} className="flex h-11 items-center gap-2 rounded-[12px] bg-white/90 px-3 text-sm font-medium text-ink-soft shadow-glass backdrop-blur-xl transition-colors hover:bg-white hover:text-ink">
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

/**
 * The step's cards down the right of a full-screen step — the selection's parameters, the
 * rooms, the lists — in one panel the height of the sheet that scrolls inside itself; the
 * sheet never moves for it. Below `lg`, the same cards under the board.
 */
export function FlowPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <aside
      data-board-edge="right"
      className={cn(
        'space-y-4 lg:absolute lg:bottom-4 lg:right-4 lg:top-[5.5rem] lg:z-20 lg:w-[340px] lg:overflow-y-auto lg:overscroll-contain lg:rounded-[18px] lg:border lg:border-line/70 lg:bg-bg-base/95 lg:p-3 lg:shadow-float lg:backdrop-blur-xl',
        className
      )}
    >
      {children}
    </aside>
  );
}

/** A refusal that has to be seen: under the bar of a full-screen step, near the top of the window below `lg`. */
export function FlowAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="fixed left-1/2 top-36 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[10px] border border-danger/40 bg-white/95 px-3 py-2 text-xs text-danger shadow-glass backdrop-blur lg:absolute lg:left-[calc((100%-356px)/2)] lg:top-[5.5rem] lg:z-30">
      {children}
    </p>
  );
}
