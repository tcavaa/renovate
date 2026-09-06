'use client';

import { Check } from 'lucide-react';
import { STYLES, STYLE_IDS } from '@/lib/design/styles';
import { useT } from '@/lib/i18n/client';
import { styleLabel } from '@/lib/i18n/labels';
import type { StyleId } from '@/lib/design/types';
import { cn } from '@/lib/utils';

/**
 * Four tall material plates, one per style: floor texture below, wall and feature wall
 * above, the palette as squares, the name set large at the foot. The chosen plate gets a
 * 2 px ink frame and a filled check; hovering lifts the textures slightly.
 */
export function StylePicker({ value, onChange }: { value: StyleId; onChange: (styleId: StyleId) => void }) {
  const t = useT();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t.design.styleTitle}>
      {STYLE_IDS.map((id, i) => {
        const style = STYLES[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={cn(
              'group relative flex flex-col overflow-hidden border bg-bg-surface text-left transition-colors',
              active ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink/40'
            )}
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <div className="flex h-full flex-col transition-transform duration-700 ease-out group-hover:scale-[1.03]">
                <div className="flex h-1/2">
                  <div
                    className="w-1/2"
                    style={{
                      backgroundColor: style.surfaces.featureWall.colorHex,
                      backgroundImage: style.surfaces.featureWall.textureUrl ? `url(${style.surfaces.featureWall.textureUrl})` : undefined,
                      backgroundSize: '140px',
                    }}
                  />
                  <div className="w-1/2" style={{ backgroundColor: style.surfaces.wall.colorHex }} />
                </div>
                <div
                  className="h-1/2"
                  style={{
                    backgroundColor: style.surfaces.floor.colorHex,
                    backgroundImage: style.surfaces.floor.textureUrl ? `url(${style.surfaces.floor.textureUrl})` : undefined,
                    backgroundSize: '160px',
                  }}
                />
              </div>
              <span className="absolute left-3 top-3 bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink backdrop-blur">{String(i + 1).padStart(2, '0')}</span>
              <span
                className={cn(
                  'absolute right-3 top-3 grid h-6 w-6 place-items-center border transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-white/70 bg-white/60 text-transparent backdrop-blur group-hover:text-ink/40'
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
              <div className="absolute bottom-3 left-3 flex gap-1">
                {style.swatches.map((hex) => (
                  <span key={hex} className="h-4 w-4 border border-white/70" style={{ backgroundColor: hex }} />
                ))}
              </div>
            </div>
            <div className="border-t border-line p-4">
              <p className="font-serif text-xl font-semibold leading-tight text-ink">{styleLabel(t, id)}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{t.styleBlurbs[id]}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
