'use client';

/**
 * The design rules' warnings in the studio (`lib/design/ruleChecks.ts`): a pill saying how many
 * there are — for the room in focus, or the whole flat — that opens the list; a warning about a
 * piece selects it. Nothing when the flat follows the rules.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { ruleViolations } from '@/lib/design/ruleChecks';
import { ruleText } from '@/components/design/ruleText';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n/client';
import type { ElectricalPoint, FloorPlan, PlacedItem } from '@/lib/design/types';

export function RuleWarnings({ plan, items, electrical, roomId, onSelectItem }: { plan: FloorPlan; items: PlacedItem[]; electrical: ElectricalPoint[]; roomId: string | null; onSelectItem: (id: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const warnings = useMemo(() => ruleViolations(plan, items, electrical).filter((v) => !roomId || v.roomId === roomId), [plan, items, electrical, roomId]);
  if (warnings.length === 0) return null;

  return (
    <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1">
      {open && (
        <ul className="max-h-56 w-[min(440px,90vw)] space-y-1 overflow-y-auto rounded-[12px] border border-line bg-bg-surface p-2 text-[11px] leading-snug text-ink-soft shadow-lg">
          {warnings.map((v, i) => (
            <li key={`${v.code}-${v.itemId ?? v.pointId ?? v.openingId ?? i}`}>
              <button
                type="button"
                disabled={!v.itemId}
                onClick={() => v.itemId && onSelectItem(v.itemId)}
                className="w-full rounded-[8px] bg-warning/10 px-2 py-1.5 text-left enabled:hover:bg-warning/20"
              >
                {ruleText(t, locale, plan, items, v)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t.design.rulesTitle}
        className="flex items-center gap-1.5 rounded-full bg-warning/90 px-2.5 py-0.5 text-[10px] font-medium text-ink"
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span>
          {t.design.rulesTitle}: {fill(t.design.rulesCount, { n: warnings.length })}
        </span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  );
}
