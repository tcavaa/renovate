'use client';

/**
 * One line that scrolls sideways, without a scrollbar.
 *
 * A bar under a 28-pixel row of icons is a third of the row, and the trays are the one place
 * in the studio where every pixel of height is taken from the 3D view. So the bar is hidden
 * and the row says where there is more the way a phone does: the edge it continues past
 * fades out — blurred and washed towards the tray's white — and the edge it ends at is
 * sharp. A row that fits shows nothing at all.
 *
 * A hidden bar must not strand the mouse, which has nothing to swipe with: a wheel turned
 * over the row scrolls it sideways, and on hover each fading edge carries a small arrow
 * that moves the row most of a screen.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type AriaRole, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ScrollRow({
  children,
  className,
  contentClassName,
  role,
  ariaLabel,
}: {
  children: ReactNode;
  /** The row's place in its parent — `min-w-0 flex-1` when it shares a line. */
  className?: string;
  /** The line itself: gaps and padding between the things in it. */
  contentClassName?: string;
  role?: AriaRole;
  ariaLabel?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    // The row's width changes with the window, its contents' with every filter; an observer
    // reports once as it starts, so there is nothing to measure by hand here.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(inner);
    // A wheel has one axis, and this row has the other.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const before = el.scrollLeft;
      el.scrollLeft += event.deltaY;
      // At either end the wheel is let through, like a scroller that has run out.
      if (el.scrollLeft !== before) event.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className={cn('group/scroll relative min-w-0', className)}>
      <div ref={scroller} onScroll={measure} role={role} aria-label={ariaLabel} className="scrollbar-none overflow-x-auto overscroll-x-contain">
        <div ref={content} className={cn('flex w-max', contentClassName)}>
          {children}
        </div>
      </div>
      <Edge side="start" shown={more.start} onPage={() => page(-1)} />
      <Edge side="end" shown={more.end} onPage={() => page(1)} />
    </div>
  );
}

function Edge({ side, shown, onPage }: { side: 'start' | 'end'; shown: boolean; onPage: () => void }) {
  const start = side === 'start';
  const Arrow = start ? ChevronLeft : ChevronRight;
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-y-0 w-10 transition-opacity duration-200', start ? 'left-0' : 'right-0', shown ? 'opacity-100' : 'opacity-0')} data-scroll-edge={side} data-shown={shown}>
      {/* Half blur, half wash: both strongest at the edge and gone by the middle of the strip. */}
      <div className={cn('absolute inset-0 backdrop-blur-[3px]', start ? '[mask-image:linear-gradient(to_right,black_30%,transparent)]' : '[mask-image:linear-gradient(to_left,black_30%,transparent)]')} />
      <div className={cn('absolute inset-0 from-white via-white/70 to-transparent', start ? 'bg-gradient-to-r' : 'bg-gradient-to-l')} />
      <button
        type="button"
        tabIndex={-1}
        onClick={onPage}
        className={cn(
          'absolute top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink-soft opacity-0 shadow-sm transition-opacity hover:border-ink hover:text-ink group-hover/scroll:opacity-100',
          start ? 'left-0.5' : 'right-0.5',
          shown ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        <Arrow className="h-3 w-3" />
      </button>
    </div>
  );
}
