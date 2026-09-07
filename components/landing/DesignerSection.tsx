import Image from 'next/image';
import { STYLE_IDS, STYLES } from '@/lib/design/styles';
import { styleLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';
import type { LandingProduct } from './ProductWall';

/**
 * "You no longer need a designer": the statement stays pinned on the left while the three
 * steps scroll past on the right, each with a visual built from the product's own data — the
 * sample plan, the four style palettes, and a tilted plan with priced furniture floating over it.
 */
/** Where each piece lands on the tilted plan (rough room centres), largest first. */
const SPOTS = [
  { left: '20%', top: '16%', w: '22%' },
  { left: '50%', top: '10%', w: '18%' },
  { left: '30%', top: '46%', w: '17%' },
  { left: '62%', top: '40%', w: '20%' },
];

export function DesignerSection({ t, products }: { t: Dictionary; products: LandingProduct[] }) {
  // Partner renders sit on pure white and blend into the preview floor; the Poly Haven stock
  // photos come on grey and would show their rectangle, so they only stand in when needed.
  const partner = products.filter((p) => p.brand !== 'Poly Haven');
  const placed = (partner.length >= 4 ? partner : products).slice(0, 4);
  return (
    <section className="container py-24 md:py-32">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow reveal">01 — 03</p>
          <h2 className="reveal mt-4 text-display-md font-bold text-ink">{t.landing.designerTitle}</h2>
          <p className="reveal mt-6 max-w-md text-lg leading-relaxed text-ink-soft">{t.landing.designerBody}</p>
        </div>

        <ol className="space-y-6">
          <Step index="01" title={t.landing.step1Title} body={t.landing.step1Desc}>
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-white">
              <Image src="/samples/plan-2br.png" alt="" fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-contain p-4 opacity-90" />
              <span className="glass absolute left-4 top-4 px-3 py-1.5 text-xs font-medium">5 × {t.design.step2}</span>
              <span className="glass absolute bottom-4 right-4 px-3 py-1.5 text-xs font-medium text-success">✓ {t.design.step1}</span>
            </div>
          </Step>

          <Step index="02" title={t.landing.step2Title} body={t.landing.step2Desc}>
            <div className="grid grid-cols-4 gap-3">
              {STYLE_IDS.map((id) => {
                const s = STYLES[id];
                return (
                  <div key={id} className="group/style overflow-hidden rounded-xl border border-line bg-white">
                    <div className="flex h-24">
                      <span
                        className="w-1/2"
                        style={{
                          backgroundColor: s.surfaces.floor.colorHex,
                          backgroundImage: s.surfaces.floor.textureUrl ? `url(${s.surfaces.floor.textureUrl})` : undefined,
                          backgroundSize: '90px',
                        }}
                      />
                      <span className="flex w-1/2 flex-col">
                        <span className="h-1/2" style={{ backgroundColor: s.surfaces.featureWall.colorHex }} />
                        <span className="h-1/2" style={{ backgroundColor: s.surfaces.wall.colorHex }} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-2">
                      <span className="truncate text-[11px] font-medium">{styleLabel(t, id)}</span>
                      <span className="flex gap-1">
                        {s.swatches.slice(0, 3).map((hex) => (
                          <span key={hex} className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: hex }} />
                        ))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Step>

          <Step index="03" title={t.landing.step3Title} body={t.landing.step3Desc}>
            {/*
              The plan lies tilted on a dark floor and the furniture lands on it as the reader
              scrolls: each piece has its own scroll-driven timeline with a later range than the
              one before, so they arrive one at a time. No JavaScript; static where unsupported.
            */}
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-white [perspective:1200px]">
              <div className="absolute inset-x-[8%] top-[12%] aspect-[4/3] [transform:rotateX(52deg)_rotateZ(-14deg)] [transform-style:preserve-3d]">
                <Image src="/samples/plan-2br.png" alt="" fill sizes="600px" className="object-contain opacity-90" />
              </div>
              {placed.map((p, i) => (
                <div
                  key={p.id}
                  className="drop-in absolute flex flex-col items-center"
                  style={{ left: SPOTS[i].left, top: SPOTS[i].top, width: SPOTS[i].w, '--i': i } as React.CSSProperties}
                >
                  {/* Renders come on white, so the box is white too; a soft ellipse grounds each piece. */}
                  <span className="absolute bottom-[14%] left-[15%] right-[15%] h-[10%] rounded-full bg-ink/30 blur-md" aria-hidden />
                  <span className="relative block aspect-square w-full">
                    {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="160px" className="object-contain mix-blend-multiply" />}
                  </span>
                  <span className="-mt-2 flex items-center gap-2 bg-ink px-2 py-1 leading-tight text-white">
                    <span className="block max-w-[110px] truncate text-[11px] font-medium">{p.name}</span>
                    <span className="block text-[11px] font-semibold text-brand">{formatGEL(p.price)}</span>
                  </span>
                </div>
              ))}
              <span className="absolute bottom-4 left-4 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">{t.landing.previewLabel}</span>
              <span className="absolute bottom-4 right-4 text-xs text-ink-muted">{t.landing.previewHint}</span>
            </div>
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({ index, title, body, children }: { index: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="reveal rounded-2xl border border-line bg-bg-surface p-4 shadow-card md:p-5">
      {children}
      <div className="mt-5 flex items-start gap-4 px-1">
        <span className="font-serif text-2xl font-bold text-ink-faint">{index}</span>
        <div>
          <h3 className="font-serif text-xl font-semibold text-ink">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
        </div>
      </div>
    </li>
  );
}
