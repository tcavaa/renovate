import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { STYLE_IDS, STYLES } from '@/lib/design/styles';
import { styleLabel } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n';

/** The four styles as tall palette cards; hovering lifts the card and reveals the swatches. */
export function StylesRow({ t }: { t: Dictionary }) {
  return (
    <section className="container py-24 md:py-32">
      <div className="max-w-2xl">
        <p className="eyebrow reveal">{t.design.step3}</p>
        <h2 className="reveal mt-4 text-display-md font-bold text-ink">{t.landing.stylesTitle}</h2>
        <p className="reveal mt-5 text-lg leading-relaxed text-ink-soft">{t.landing.stylesBody}</p>
      </div>

      <ul className="reveal-stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STYLE_IDS.map((id) => {
          const s = STYLES[id];
          return (
            <li key={id}>
              <Link
                href="/design"
                className="group relative block aspect-[3/4] overflow-hidden rounded-2xl shadow-card transition-all duration-500 ease-out hover:-translate-y-1.5 hover:shadow-cardHover"
              >
                <span
                  className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105"
                  style={{
                    backgroundColor: s.surfaces.featureWall.colorHex,
                    backgroundImage: s.surfaces.featureWall.textureUrl ? `url(${s.surfaces.featureWall.textureUrl})` : undefined,
                    backgroundSize: '220px',
                  }}
                />
                <span
                  className="absolute inset-x-0 bottom-0 h-[38%]"
                  style={{
                    backgroundColor: s.surfaces.floor.colorHex,
                    backgroundImage: s.surfaces.floor.textureUrl ? `url(${s.surfaces.floor.textureUrl})` : undefined,
                    backgroundSize: '160px',
                  }}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <span className="flex gap-1.5 opacity-0 transition-all duration-500 group-hover:opacity-100">
                    {s.swatches.map((hex) => (
                      <span key={hex} className="h-3.5 w-3.5 rounded-full ring-1 ring-white/60" style={{ backgroundColor: hex }} />
                    ))}
                  </span>
                  <span className="mt-3 flex items-end justify-between">
                    <span className="font-serif text-2xl font-semibold">{styleLabel(t, id)}</span>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur transition-colors group-hover:bg-brand">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-white/70">{t.styleBlurbs[id]}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
