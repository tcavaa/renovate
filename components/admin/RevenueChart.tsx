import type { Locale } from '@/lib/i18n';
import { formatGEL } from '@/lib/utils';

/**
 * Daily fees and commissions as stacked bars, drawn as static SVG on the server — no chart
 * library, nothing to hydrate. Fees (ink) sit under commissions (terracotta); the tallest
 * day sets the scale, and days with nothing still get their slot so gaps read as gaps.
 */
export function RevenueChart({ days, locale }: { days: Array<{ day: string; fees: number; commissions: number }>; locale: Locale }) {
  const W = 960;
  const H = 220;
  const PAD = { top: 12, right: 8, bottom: 28, left: 8 };
  const max = Math.max(1, ...days.map((d) => d.fees + d.commissions));
  const n = Math.max(1, days.length);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / n;
  const bar = Math.max(2, Math.min(28, slot * 0.7));
  const labelEvery = n <= 14 ? 1 : n <= 45 ? 7 : Math.ceil(n / 12);
  const dateLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  const label = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  };
  const empty = days.every((d) => d.fees === 0 && d.commissions === 0);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full min-w-[640px]" role="img" aria-label="revenue by day">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * (1 - f)} y2={PAD.top + innerH * (1 - f)} stroke="currentColor" className="text-line" strokeDasharray="2 4" />
            <text x={W - PAD.right} y={PAD.top + innerH * (1 - f) - 3} textAnchor="end" className="fill-ink-muted text-[10px]">
              {formatGEL(max * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = PAD.left + slot * i + (slot - bar) / 2;
          const feeH = (d.fees / max) * innerH;
          const comH = (d.commissions / max) * innerH;
          const baseY = PAD.top + innerH;
          return (
            <g key={d.day}>
              <title>{`${label(d.day)} — ${formatGEL(d.fees)} + ${formatGEL(d.commissions)}`}</title>
              {feeH > 0 && <rect x={x} y={baseY - feeH} width={bar} height={feeH} className="fill-ink" />}
              {comH > 0 && <rect x={x} y={baseY - feeH - comH} width={bar} height={comH} className="fill-brand" />}
              {feeH === 0 && comH === 0 && <rect x={x} y={baseY - 1} width={bar} height={1} className="fill-line" />}
              {i % labelEvery === 0 && (
                <text x={x + bar / 2} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[10px]">
                  {label(d.day)}
                </text>
              )}
            </g>
          );
        })}
        {empty && (
          <text x={W / 2} y={PAD.top + innerH / 2} textAnchor="middle" className="fill-ink-muted text-xs">
            —
          </text>
        )}
      </svg>
    </div>
  );
}
