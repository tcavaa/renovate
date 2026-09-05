'use client';

import { Check, Frame, Home, Sofa } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import type { HomeState } from '@/lib/calculator/types';

const options: Array<{
  value: HomeState;
  icon: React.ComponentType<{ className?: string }>;
  accentBorder: string;
  iconWrap: string;
}> = [
  {
    value: 'black_frame',
    icon: Frame,
    accentBorder: 'data-[selected=true]:border-slate-deep data-[selected=true]:ring-slate-deep/20',
    iconWrap: 'bg-slate-deep/10 text-slate-deep',
  },
  {
    value: 'white_frame',
    icon: Home,
    accentBorder: 'data-[selected=true]:border-brand data-[selected=true]:ring-brand/20',
    iconWrap: 'bg-brand/10 text-brand',
  },
  {
    value: 'green_frame',
    icon: Sofa,
    accentBorder: 'data-[selected=true]:border-success data-[selected=true]:ring-success/20',
    iconWrap: 'bg-success/10 text-success',
  },
];

export function HomeStateSelector({
  value,
  onChange,
}: {
  value: HomeState | null;
  onChange: (v: HomeState) => void;
}) {
  const ka = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {options.map((opt) => {
        const t = ka.homeState[opt.value];
        const selected = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            data-selected={selected}
            className={cn(
              'group relative flex h-full flex-col rounded-lg border-2 border-line bg-bg-surface p-6 text-left shadow-card transition-all hover:shadow-cardHover',
              'data-[selected=true]:ring-4',
              opt.accentBorder
            )}
          >
            {selected && (
              <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-brand text-white shadow">
                <Check className="h-4 w-4" />
              </span>
            )}
            <span
              className={cn(
                'mb-4 grid h-12 w-12 place-items-center rounded-lg',
                opt.iconWrap
              )}
            >
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="mb-2 font-serif text-lg font-semibold">{t.label}</h3>
            <p className="text-sm leading-relaxed text-ink-muted">{t.description}</p>
          </button>
        );
      })}
    </div>
  );
}
