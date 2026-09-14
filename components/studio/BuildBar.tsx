'use client';

/**
 * The studio's categories, the way a game's build mode does it: a rail of big tiles down
 * the left — build, furniture, electric & light, finishes, budget — and, along the bottom of
 * the canvas, the tray of the open category: its tools, or the shelf of products. One
 * category open at a time; clicking it again folds the tray so the canvas gets the room back.
 */

import { BrickWall, Cable, PaintBucket, Sofa, Wallet, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';

export type StudioCategory = 'build' | 'furniture' | 'electric' | 'finishes' | 'budget';

const CATEGORIES: Array<{ id: StudioCategory; icon: LucideIcon; key: keyof Dictionary['build'] }> = [
  { id: 'build', icon: BrickWall, key: 'catBuild' },
  { id: 'furniture', icon: Sofa, key: 'catFurniture' },
  { id: 'electric', icon: Cable, key: 'catElectric' },
  { id: 'finishes', icon: PaintBucket, key: 'catFinishes' },
  { id: 'budget', icon: Wallet, key: 'catBudget' },
];

/** The vertical rail of categories on the left of the canvas. */
export function CategoryRail({ category, trayOpen, onCategory, badge, className }: { category: StudioCategory; trayOpen: boolean; onCategory: (category: StudioCategory) => void; /** A small figure under a category (the budget total). */ badge?: Partial<Record<StudioCategory, string>>; className?: string }) {
  const t = useT();
  return (
    <nav className={cn('flex flex-col gap-1 rounded-[18px] border border-white/70 bg-white/92 p-1.5 shadow-float backdrop-blur-xl', className)} aria-label={t.design.studioTitle} data-tour="rail">
      {CATEGORIES.map(({ id, icon: Icon, key }) => {
        const active = category === id && trayOpen;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onCategory(id)}
            aria-pressed={active}
            data-tour={`rail-${id}`}
            className={cn(
              'flex h-[62px] w-[72px] flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[10px] font-semibold leading-none transition-all',
              active ? 'bg-ink text-white shadow-card' : category === id ? 'bg-sand-light text-ink' : 'text-ink-soft hover:bg-sand-light hover:text-ink'
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{t.build[key]}</span>
            {badge?.[id] && <span className={cn('max-w-full truncate text-[9px] font-medium tabular-nums', active ? 'text-white/70' : 'text-ink-muted')}>{badge[id]}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** The open category's tray, along the bottom of the canvas. */
export function Tray({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('w-full max-w-[880px] rounded-[16px] border border-white/70 bg-white/92 p-2.5 shadow-float backdrop-blur-xl animate-fade-in', className)} data-tour="tray">{children}</div>;
}
