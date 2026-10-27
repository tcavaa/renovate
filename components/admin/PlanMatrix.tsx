'use client';

import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { PLAN_FEATURES, PLAN_IDS, type PlanConfig, type PlanFeature, type PlanId } from '@/lib/plans/plans';
import { cn } from '@/lib/utils';

/** A plan's month and year prices as the form holds them (strings while typed). */
export type PlanPriceFields = Record<'premiumMonthPrice' | 'premiumYearPrice' | 'professionalMonthPrice' | 'professionalYearPrice', string>;

/**
 * What each plan includes, as admin edits it (docs/subscriptions.md): the plans across — with
 * their month and year prices — and down the side what every plan has (seeing the flat in 3D,
 * the budget, drawing a plan), each feature with a tick per plan, the projects each may make
 * (Free: at a time; a paid plan: a month; blank is no limit) and the renders a month a plan with
 * renders includes. The pricing page, the locks and the server all read what is saved here.
 */
export function PlanMatrix({
  config,
  onConfig,
  prices,
  onPrice,
}: {
  config: PlanConfig;
  onConfig: (config: PlanConfig) => void;
  prices: PlanPriceFields;
  onPrice: (key: keyof PlanPriceFields, value: string) => void;
}) {
  const t = useT();
  const p = t.plans;
  const s = t.admin.settings;
  const name = (plan: PlanId) => (plan === 'free' ? p.free : plan === 'premium' ? p.premium : p.professional);
  const featureName: Record<PlanFeature, string> = {
    planUpload: p.featurePlanUpload,
    catalog: p.featureCatalog,
    moveFurniture: p.featureMoveFurniture,
    walk: p.featureWalk,
    renders: p.featureRenders,
    ownItems: p.featureOwnItems,
  };

  const toggle = (plan: PlanId, feature: PlanFeature) => {
    const has = config.features[plan].includes(feature);
    const next = has ? config.features[plan].filter((f) => f !== feature) : PLAN_FEATURES.filter((f) => f === feature || config.features[plan].includes(f));
    onConfig({ ...config, features: { ...config.features, [plan]: next } });
  };
  const count = (key: 'projects' | 'freeRenders', plan: PlanId, raw: string) => {
    const n = raw.trim() === '' ? null : Math.max(0, Math.round(Number(raw)));
    if (n !== null && !Number.isFinite(n)) return;
    onConfig({ ...config, [key]: { ...config[key], [plan]: key === 'freeRenders' ? (n ?? 0) : n } });
  };

  const priceInput = (key: keyof PlanPriceFields, label: string) => (
    <label className="flex items-center gap-1.5 text-[11px] font-normal text-ink-muted">
      <Input type="number" step="0.5" min={1} value={prices[key]} onChange={(e) => onPrice(key, e.target.value)} aria-label={label} className="h-8 w-20 px-2 text-sm text-ink" />
      {label}
    </label>
  );

  const cell = 'border-b border-line/70 px-3 py-2.5 align-middle';
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-sand/50 text-left">
            <th className={cn(cell, 'w-[32%] font-medium text-ink-muted')} />
            {PLAN_IDS.map((plan) => (
              <th key={plan} className={cn(cell, 'font-semibold text-ink')}>
                <span className="block">{name(plan)}</span>
                {plan === 'free' ? (
                  <span className="mt-1 block text-[11px] font-normal text-ink-muted">0 ₾</span>
                ) : (
                  <span className="mt-1.5 flex flex-col gap-1">
                    {priceInput(plan === 'premium' ? 'premiumMonthPrice' : 'professionalMonthPrice', s.perMonthLabel)}
                    {priceInput(plan === 'premium' ? 'premiumYearPrice' : 'professionalYearPrice', s.perYearLabel)}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cell}>
              <span className="text-ink">{s.planProjects}</span>
              <span className="block text-[11px] text-ink-muted">{s.planProjectsHint}</span>
            </td>
            {PLAN_IDS.map((plan) => (
              <td key={plan} className={cell}>
                <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <Input type="number" min={0} max={10000} value={config.projects[plan] ?? ''} placeholder="∞" onChange={(e) => count('projects', plan, e.target.value)} aria-label={`${s.planProjects} · ${name(plan)}`} className="h-8 w-20 px-2 text-sm text-ink" />
                  {plan === 'free' ? s.planAtATime : s.planPerMonth}
                </label>
              </td>
            ))}
          </tr>
          <tr>
            <td className={cell}>{s.planAlways}</td>
            {PLAN_IDS.map((plan) => (
              <td key={plan} className={cell}>
                <Check className="h-4 w-4 text-ink-faint" aria-label={s.planAlwaysOn} />
              </td>
            ))}
          </tr>
          {PLAN_FEATURES.map((feature) => (
            <tr key={feature}>
              <td className={cell}>{featureName[feature]}</td>
              {PLAN_IDS.map((plan) => (
                <td key={plan} className={cell}>
                  <input type="checkbox" checked={config.features[plan].includes(feature)} onChange={() => toggle(plan, feature)} aria-label={`${featureName[feature]} · ${name(plan)}`} className="h-4 w-4 accent-ink" />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className={cell}>
              <span className="text-ink">{s.planFreeRenders}</span>
              <span className="block text-[11px] text-ink-muted">{s.planFreeRendersHint}</span>
            </td>
            {PLAN_IDS.map((plan) => {
              const on = config.features[plan].includes('renders');
              return (
                <td key={plan} className={cell}>
                  <Input type="number" min={0} max={10000} disabled={!on} value={on ? config.freeRenders[plan] : ''} onChange={(e) => count('freeRenders', plan, e.target.value)} aria-label={`${s.planFreeRenders} · ${name(plan)}`} className="h-8 w-20 px-2 text-sm" />
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-muted">{s.planMatrixNote}</p>
    </div>
  );
}
