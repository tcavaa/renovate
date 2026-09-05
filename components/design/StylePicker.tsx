'use client';

import { Check } from 'lucide-react';
import { STYLES, STYLE_IDS } from '@/lib/design/styles';
import type { StyleId } from '@/lib/design/types';
import { cn } from '@/lib/utils';

const LABELS: Record<StyleId, { ka: string; en: string; blurbKa: string }> = {
  modern: {
    ka: 'თანამედროვე',
    en: 'Modern',
    blurbKa: 'სუფთა ხაზები, გრაფიტი და თეთრი, მინა და ქრომი.',
  },
  scandinavian: {
    ka: 'სკანდინავიური',
    en: 'Scandinavian',
    blurbKa: 'ღია მუხა, რბილი ტექსტილი, ბევრი სინათლე.',
  },
  industrial: {
    ka: 'ინდუსტრიული',
    en: 'Industrial',
    blurbKa: 'აგური, შავი ლითონი, ტყავი და მასივი.',
  },
  vintage: {
    ka: 'ვინტაჟი',
    en: 'Vintage',
    blurbKa: 'კაკალი, სპილენძი, ხავერდი და ნიმუშები.',
  },
};

export function StylePicker({
  value,
  onChange,
}: {
  value: StyleId;
  onChange: (styleId: StyleId) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STYLE_IDS.map((id) => {
        const style = STYLES[id];
        const label = LABELS[id];
        const active = value === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={cn(
              'group overflow-hidden rounded-lg border bg-bg-surface text-left transition-all',
              active
                ? 'border-brand shadow-cardHover ring-2 ring-brand/25'
                : 'border-line shadow-card hover:border-brand/40 hover:shadow-cardHover'
            )}
          >
            {/* A quick read of the palette: floor, walls, feature wall, then the accents. */}
            <div className="relative h-28 w-full">
              <div className="flex h-full">
                <div
                  className="w-1/2"
                  style={{
                    backgroundColor: style.surfaces.floor.colorHex,
                    backgroundImage: style.surfaces.floor.textureUrl
                      ? `url(${style.surfaces.floor.textureUrl})`
                      : undefined,
                    backgroundSize: '120px',
                  }}
                />
                <div className="flex w-1/2 flex-col">
                  <div
                    className="h-1/2"
                    style={{
                      backgroundColor: style.surfaces.featureWall.colorHex,
                      backgroundImage: style.surfaces.featureWall.textureUrl
                        ? `url(${style.surfaces.featureWall.textureUrl})`
                        : undefined,
                      backgroundSize: '100px',
                    }}
                  />
                  <div
                    className="h-1/2"
                    style={{ backgroundColor: style.surfaces.wall.colorHex }}
                  />
                </div>
              </div>

              <div className="absolute bottom-2 left-2 flex gap-1">
                {style.swatches.map((hex) => (
                  <span
                    key={hex}
                    className="h-4 w-4 rounded-full border border-white/70 shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>

              {active && (
                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand text-white shadow-sm">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="p-3">
              <p className="font-serif text-base font-semibold text-ink">{label.ka}</p>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">{label.en}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{label.blurbKa}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
