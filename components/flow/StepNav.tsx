'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The bar that ends every step: a quiet back link on the left, the one primary action on
 * the right, room for a running total in between. Sticks to the bottom of the viewport so
 * the way forward is always in reach.
 */
export function StepNav({
  back,
  next,
  children,
  sticky = true,
  className,
}: {
  back?: { href: string; label: string };
  next?: {
    label: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
  };
  /** Anything between back and next — a total, a note. */
  children?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  const nextIcon = next?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : next?.icon ?? <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />;
  const nextInner = (
    <>
      {next?.label}
      {nextIcon}
    </>
  );
  return (
    <div className={cn('no-print border-t border-line bg-bg-base/90 backdrop-blur-md', sticky && 'sticky bottom-0 z-30', className)}>
      <div className="container flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-4">
          {back ? (
            <Link href={back.href} className="group inline-flex items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink">
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              {back.label}
            </Link>
          ) : (
            <span />
          )}
        </div>
        {children && <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:px-6">{children}</div>}
        {next &&
          (next.href && !next.disabled ? (
            <Button asChild variant="ink" size="lg" className="group min-w-[200px] px-6">
              <Link href={next.href}>{nextInner}</Link>
            </Button>
          ) : (
            <Button type="button" variant="ink" size="lg" className="group min-w-[200px] px-6" onClick={next.onClick} disabled={next.disabled || next.loading}>
              {nextInner}
            </Button>
          ))}
      </div>
    </div>
  );
}
