'use client';

import { DoorOpen, LayoutGrid, PaintBucket, Sofa, Wallet, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type RailTab = 'rooms' | 'openings' | 'items' | 'finishes' | 'cost';

/**
 * The studio's left rail: five icons, one open panel at a time. Clicking the active icon
 * closes its panel so the canvas gets the whole width back.
 */
export function StudioRail({ active, onChange }: { active: RailTab | null; onChange: (tab: RailTab | null) => void }) {
  const t = useT();
  const tabs: Array<{ id: RailTab; icon: LucideIcon; label: string }> = [
    { id: 'rooms', icon: LayoutGrid, label: t.design.step2 },
    { id: 'openings', icon: DoorOpen, label: t.design.openingsTitle },
    { id: 'items', icon: Sofa, label: t.design.furnitureTitle },
    { id: 'finishes', icon: PaintBucket, label: t.design.finishesTitle },
    { id: 'cost', icon: Wallet, label: t.design.furnitureTotal },
  ];
  return (
    <nav className="glass flex flex-col gap-1 rounded-2xl p-1.5" aria-label={t.design.studioTitle}>
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active === id}
          onClick={() => onChange(active === id ? null : id)}
          className={cn(
            'grid h-11 w-11 place-items-center rounded-xl transition-colors',
            active === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white hover:text-ink'
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </button>
      ))}
    </nav>
  );
}
