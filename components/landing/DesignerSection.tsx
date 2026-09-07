import Image from 'next/image';
import { Check, Upload } from 'lucide-react';
import { STYLE_IDS, STYLES } from '@/lib/design/styles';
import { styleLabel } from '@/lib/i18n/labels';
import { formatGEL, formatM2 } from '@/lib/utils';
import { CountUp } from '@/components/motion/CountUp';
import type { Dictionary } from '@/lib/i18n';
import type { LandingProduct } from './ProductWall';

export interface LandingEstimate {
  rooms: number;
  floorM2: number;
  wallM2: number;
  materials: number;
  workers: number;
  total: number;
}

/** Where each piece lands on the tilted plan (rough room centres), largest first. */
const SPOTS = [
  { left: '20%', top: '16%', w: '22%' },
  { left: '50%', top: '10%', w: '18%' },
  { left: '30%', top: '46%', w: '17%' },
  { left: '62%', top: '40%', w: '20%' },
];

/** Scroll range (percent of the element's entry) as CSS custom properties. */
const seq = (from: number, to: number, extra: Record<string, string | number> = {}) =>
  ({ '--from': `${from}%`, '--to': `${to}%`, ...extra }) as React.CSSProperties;

/**
 * "You no longer need a designer": the statement stays pinned on the left while four steps
 * scroll past on the right, each one played by scrolling rather than watched — a plan that
 * uploads itself, an estimate that counts itself up, materials that replace one another, and
 * furniture that lands on the plan piece by piece. All of it is CSS scroll timelines; where
 * they are unsupported the finished state is simply shown.
 */
export function DesignerSection({ t, products, estimate }: { t: Dictionary; products: LandingProduct[]; estimate: LandingEstimate }) {
  // Partner renders sit on pure white and blend into the preview floor; the Poly Haven stock
  // photos come on grey and would show their rectangle, so they only stand in when needed.
  const partner = products.filter((p) => p.brand !== 'Poly Haven');
  const placed = (partner.length >= 4 ? partner : products).slice(0, 4);

  return (
    <section className="container py-24 md:py-32">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow reveal">01 — 04</p>
          <h2 className="reveal mt-4 text-display-md font-bold text-ink">{t.landing.designerTitle}</h2>
          <p className="reveal mt-6 max-w-md text-lg leading-relaxed text-ink-soft">{t.landing.designerBody}</p>
        </div>

        <ol className="space-y-6">
          {/* 01 — the plan uploads itself: a bar fills, the drawing wipes in, a check lands. */}
          <Step index="01" title={t.landing.step1Title} body={t.landing.step1Desc}>
            <div className="relative aspect-[16/10] overflow-clip rounded-xl border border-dashed border-line bg-bg-base">
              <div className="seq seq-fade-out absolute inset-0 flex flex-col items-center justify-center gap-3" style={seq(30, 37)}>
                <span className="grid h-12 w-12 place-items-center border border-line bg-white text-ink">
                  <Upload className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-ink">{t.design.uploadHint}</span>
                <span className="mt-1 h-9 w-40 overflow-clip border border-line bg-white">
                  <span className="seq seq-fill block h-full w-full bg-ink" style={seq(12, 30)} />
                </span>
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">{t.landing.uploading}…</span>
              </div>
              <div className="seq seq-wipe-up absolute inset-0 bg-white" style={seq(36, 50)}>
                <Image src="/samples/plan-2br.png" alt="" fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-contain p-4 opacity-90" />
              </div>
              <span className="seq seq-pop absolute bottom-4 right-4 inline-flex items-center gap-1.5 border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink" style={seq(52, 58)}>
                <Check className="h-3.5 w-3.5 text-success" />
                {estimate.rooms} {t.landing.uploadDone}
              </span>
            </div>
          </Step>

          {/* 02 — the estimate counts itself up: a small invoice from the real engine. */}
          <Step index="02" title={t.landing.stepCalcTitle} body={t.landing.stepCalcDesc}>
            <div className="relative aspect-[16/10] overflow-clip rounded-xl bg-bg-base">
              <div className="absolute inset-x-[10%] top-1/2 -translate-y-1/2 border border-line bg-white px-6 py-5 md:px-8">
                <div className="flex items-baseline justify-between border-b border-line pb-3">
                  <span className="font-serif text-lg font-semibold text-ink">{t.summary.title}</span>
                  <span className="text-xs text-ink-muted">
                    {estimate.rooms} {t.landing.invoiceRooms} · {formatM2(estimate.floorM2)}
                  </span>
                </div>
                <div className="seq seq-rise flex items-baseline justify-between border-b border-line/70 py-2 text-xs text-ink-muted" style={seq(18, 26)}>
                  <span>
                    {t.calculator.summaryFloor} · {formatM2(estimate.floorM2)}
                  </span>
                  <span>
                    {t.calculator.summaryWalls} · {formatM2(estimate.wallM2)}
                  </span>
                </div>
                <InvoiceRow label={t.summary.materials} value={estimate.materials} from={24} />
                <InvoiceRow label={t.summary.workers} value={estimate.workers} from={32} />
                <InvoiceRow label={t.summary.contingency} value={estimate.total - estimate.materials - estimate.workers} from={40} muted />
                <div className="seq seq-rise mt-3 flex items-baseline justify-between border-t-2 border-ink pt-3" style={seq(48, 56)}>
                  <span className="text-sm font-semibold text-ink">{t.summary.grandTotalWithMargin}</span>
                  <span className="font-serif text-2xl font-bold text-ink md:text-3xl">
                    <CountUp value={estimate.total} suffix=" ₾" duration={1600} />
                  </span>
                </div>
              </div>
            </div>
          </Step>

          {/* 03 — one room, four styles: each material set wipes over the last as you scroll. */}
          <Step index="03" title={t.landing.step2Title} body={t.landing.step2Desc}>
            <div className="relative aspect-[16/10] overflow-clip rounded-xl bg-bg-base">
              {STYLE_IDS.map((id, i) => {
                const s = STYLES[id];
                return (
                  <div key={id} className={i === 0 ? 'absolute inset-0' : 'seq seq-wipe-right absolute inset-0'} style={i === 0 ? undefined : seq(12 + i * 13, 22 + i * 13)}>
                    <div
                      className="absolute inset-x-0 top-0 h-[62%]"
                      style={{
                        backgroundColor: s.surfaces.featureWall.colorHex,
                        backgroundImage: s.surfaces.featureWall.textureUrl ? `url(${s.surfaces.featureWall.textureUrl})` : undefined,
                        backgroundSize: '260px',
                      }}
                    />
                    <div className="absolute inset-x-[42%] top-0 h-[62%]" style={{ backgroundColor: s.surfaces.wall.colorHex }} />
                    <div
                      className="absolute inset-x-0 bottom-0 h-[38%]"
                      style={{
                        backgroundColor: s.surfaces.floor.colorHex,
                        backgroundImage: s.surfaces.floor.textureUrl ? `url(${s.surfaces.floor.textureUrl})` : undefined,
                        backgroundSize: '180px',
                      }}
                    />
                    <div className="absolute inset-x-0 top-[62%] h-px bg-ink/20" />
                  </div>
                );
              })}
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                <div className="relative h-7 w-48">
                  {STYLE_IDS.map((id, i) => {
                    const last = i === STYLE_IDS.length - 1;
                    const start = 12 + i * 13;
                    const nextStart = 12 + (i + 1) * 13;
                    // One label at a time: in at its own wipe, out when the next wipe starts.
                    const style: React.CSSProperties =
                      i === 0
                        ? { animationName: 'seq-fade-out', animationRange: `cover ${nextStart}% cover ${nextStart + 4}%` }
                        : last
                          ? { animationName: 'seq-fade', animationRange: `cover ${start}% cover ${start + 6}%` }
                          : { animationName: 'seq-fade, seq-fade-out', animationRange: `cover ${start}% cover ${start + 6}%, cover ${nextStart}% cover ${nextStart + 4}%` };
                    return (
                      <span key={id} className="seq absolute bottom-0 left-0 border border-white/40 bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur" style={style}>
                        {styleLabel(t, id)}
                      </span>
                    );
                  })}
                </div>
                <span className="flex gap-1.5">
                  {STYLES[STYLE_IDS[STYLE_IDS.length - 1]].swatches.map((hex) => (
                    <span key={hex} className="seq seq-pop h-3 w-3 border border-white/60" style={{ backgroundColor: hex, ...seq(56, 62) }} />
                  ))}
                </span>
              </div>
            </div>
          </Step>

          {/* 04 — furniture lands on the plan piece by piece (`.drop-in` staggers by `--i`). */}
          <Step index="04" title={t.landing.step3Title} body={t.landing.step3Desc}>
            <div className="relative aspect-[16/10] overflow-clip rounded-xl bg-white [perspective:1200px]">
              <div className="absolute inset-x-[8%] top-[12%] aspect-[4/3] [transform:rotateX(52deg)_rotateZ(-14deg)] [transform-style:preserve-3d]">
                <Image src="/samples/plan-2br.png" alt="" fill sizes="600px" className="object-contain opacity-90" />
              </div>
              {placed.map((p, i) => (
                <div key={p.id} className="drop-in absolute flex flex-col items-center" style={{ left: SPOTS[i].left, top: SPOTS[i].top, width: SPOTS[i].w, '--i': i } as React.CSSProperties}>
                  {/* Renders come on white, so the floor is white too; a soft ellipse grounds each piece. */}
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

function InvoiceRow({ label, value, from, muted }: { label: string; value: number; from: number; muted?: boolean }) {
  return (
    <div className="seq seq-rise flex items-baseline justify-between border-b border-line/70 py-2.5 text-sm" style={seq(from, from + 8)}>
      <span className={muted ? 'text-ink-muted' : 'text-ink-soft'}>{label}</span>
      <span className={muted ? 'font-medium text-ink-muted' : 'font-semibold text-ink'}>
        <CountUp value={value} suffix=" ₾" />
      </span>
    </div>
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
