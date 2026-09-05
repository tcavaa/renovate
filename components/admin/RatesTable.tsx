'use client';

/**
 * Inline editing of the calculator's rate book.
 *
 * One row per rate, grouped by renovation phase; every field the engine multiplies by is an
 * input, and each row saves on its own so a single price change is one click. Material rows
 * can be added (a new product line the market started selling); labour lines are fixed by
 * the engine and can only be repriced or switched off.
 */

import { useMemo, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { PHASE_NAMES } from '@/lib/calculator/constants';
import { invalidateRateBook } from '@/hooks/useRateBook';
import type { RateRow } from '@/lib/calculator/rates';
import { cn } from '@/lib/utils';

const UNITS = ['m2', 'linear_m', 'piece', 'liter', 'kg', 'm3'] as const;
const BASES = ['floor', 'wall', 'ceiling', 'wet_floor', 'perimeter'] as const;

type Draft = {
  labelKa: string;
  phase: string;
  unit: string;
  basis: string;
  qtyPerM2: string;
  wasteFactorPct: string;
  pricePerUnit: string;
  isActive: boolean;
};

function toDraft(row: RateRow): Draft {
  return {
    labelKa: row.labelKa,
    phase: String(row.phase),
    unit: row.unit,
    basis: row.basis ?? 'floor',
    qtyPerM2: row.qtyPerM2 == null ? '' : String(Number(row.qtyPerM2)),
    wasteFactorPct: row.wasteFactorPct == null ? '' : String(Number(row.wasteFactorPct)),
    pricePerUnit: String(Number(row.pricePerUnit)),
    isActive: row.isActive,
  };
}

export function RatesTable({ initialRows }: { initialRows: RateRow[] }) {
  const t = useT();
  const [rows, setRows] = useState<RateRow[]>(initialRows);
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(initialRows.map((r) => [r.id, toDraft(r)]))
  );
  const [saving, setSaving] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});
  const [adding, setAdding] = useState(false);
  const [newRate, setNewRate] = useState({ key: '', labelKa: '', phase: '11', unit: 'm2', basis: 'floor', qtyPerM2: '1', wasteFactorPct: '10', pricePerUnit: '0' });
  const [addError, setAddError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byKind = { material: [] as RateRow[], labour: [] as RateRow[] };
    for (const r of rows) byKind[r.kind].push(r);
    const phases = (list: RateRow[]) => {
      const map = new Map<number, RateRow[]>();
      for (const r of list) map.set(r.phase, [...(map.get(r.phase) ?? []), r]);
      return [...map.entries()].sort((a, b) => a[0] - b[0]);
    };
    return { material: phases(byKind.material), labour: phases(byKind.labour) };
  }, [rows]);

  const setField = (id: number, field: keyof Draft, value: string | boolean) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));

  const dirty = (row: RateRow) => JSON.stringify(drafts[row.id]) !== JSON.stringify(toDraft(row));

  const save = async (row: RateRow) => {
    const draft = drafts[row.id];
    setSaving((s) => ({ ...s, [row.id]: 'saving' }));
    try {
      const res = await fetch(`/api/calculator/rates/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelKa: draft.labelKa,
          phase: Number(draft.phase),
          unit: draft.unit,
          basis: row.kind === 'material' ? draft.basis : null,
          qtyPerM2: row.kind === 'material' ? Number(draft.qtyPerM2 || 0) : null,
          wasteFactorPct: row.kind === 'material' ? Number(draft.wasteFactorPct || 0) : null,
          pricePerUnit: Number(draft.pricePerUnit || 0),
          isActive: draft.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.data) throw new Error(json.error ?? 'save failed');
      const updated = json.data as RateRow;
      setRows((all) => all.map((r) => (r.id === row.id ? updated : r)));
      setDrafts((d) => ({ ...d, [row.id]: toDraft(updated) }));
      invalidateRateBook();
      setSaving((s) => ({ ...s, [row.id]: 'saved' }));
      setTimeout(() => setSaving((s) => ({ ...s, [row.id]: undefined as never })), 1500);
    } catch {
      setSaving((s) => ({ ...s, [row.id]: 'error' }));
    }
  };

  const add = async () => {
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch('/api/calculator/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'material',
          key: newRate.key.trim(),
          labelKa: newRate.labelKa.trim(),
          phase: Number(newRate.phase),
          unit: newRate.unit,
          basis: newRate.basis,
          qtyPerM2: Number(newRate.qtyPerM2 || 0),
          wasteFactorPct: Number(newRate.wasteFactorPct || 0),
          pricePerUnit: Number(newRate.pricePerUnit || 0),
          sortOrder: rows.filter((r) => r.kind === 'material').length,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.data) throw new Error(json.error ?? 'create failed');
      const created = json.data as RateRow;
      setRows((all) => [...all, created]);
      setDrafts((d) => ({ ...d, [created.id]: toDraft(created) }));
      setNewRate({ key: '', labelKa: '', phase: '11', unit: 'm2', basis: 'floor', qtyPerM2: '1', wasteFactorPct: '10', pricePerUnit: '0' });
      invalidateRateBook();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t.admin.rateSaveError);
    } finally {
      setAdding(false);
    }
  };

  const renderGroup = (kind: 'material' | 'labour', phases: Array<[number, RateRow[]]>) => (
    <Card key={kind}>
      <CardContent className="overflow-x-auto p-0">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-serif text-lg font-semibold">
            {kind === 'material' ? t.admin.rateMaterials : t.admin.rateLabour}
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2">{t.admin.table.name}</th>
              <th className="px-3 py-2">{t.admin.rateKey}</th>
              <th className="px-3 py-2">{t.admin.ratePhase}</th>
              <th className="px-3 py-2">{t.admin.rateUnit}</th>
              {kind === 'material' && <th className="px-3 py-2">{t.admin.rateBasis}</th>}
              {kind === 'material' && <th className="px-3 py-2">{t.admin.rateQtyPerM2}</th>}
              {kind === 'material' && <th className="px-3 py-2">{t.admin.rateWaste}</th>}
              <th className="px-3 py-2">{t.admin.ratePrice}</th>
              <th className="px-3 py-2">{t.admin.rateActive}</th>
              <th className="px-3 py-2 text-right">{t.admin.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {phases.map(([phase, list]) => (
              <>
                <tr key={`p-${kind}-${phase}`} className="bg-bg-base/60">
                  <td colSpan={10} className="px-3 py-1.5 text-xs font-semibold text-ink-muted">
                    {phase}. {PHASE_NAMES[phase] ?? ''}
                  </td>
                </tr>
                {list.map((row) => {
                  const d = drafts[row.id];
                  const state = saving[row.id];
                  return (
                    <tr key={row.id} className={cn('border-b border-line/60', !d.isActive && 'opacity-60')}>
                      <td className="px-3 py-1.5">
                        <Input value={d.labelKa} onChange={(e) => setField(row.id, 'labelKa', e.target.value)} className="h-8 min-w-[220px]" />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-ink-muted">{row.key}</td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min={0} max={20} value={d.phase} onChange={(e) => setField(row.id, 'phase', e.target.value)} className="h-8 w-16" />
                      </td>
                      <td className="px-3 py-1.5">
                        {kind === 'material' ? (
                          <select value={d.unit} onChange={(e) => setField(row.id, 'unit', e.target.value)} className="h-8 rounded-md border border-line bg-bg-surface px-2 text-sm">
                            {UNITS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-ink-muted">{row.unit}</span>
                        )}
                      </td>
                      {kind === 'material' && (
                        <td className="px-3 py-1.5">
                          <select value={d.basis} onChange={(e) => setField(row.id, 'basis', e.target.value)} className="h-8 rounded-md border border-line bg-bg-surface px-2 text-sm">
                            {BASES.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {kind === 'material' && (
                        <td className="px-3 py-1.5">
                          <Input type="number" step="0.001" min={0} value={d.qtyPerM2} onChange={(e) => setField(row.id, 'qtyPerM2', e.target.value)} className="h-8 w-24" />
                        </td>
                      )}
                      {kind === 'material' && (
                        <td className="px-3 py-1.5">
                          <Input type="number" step="1" min={0} max={100} value={d.wasteFactorPct} onChange={(e) => setField(row.id, 'wasteFactorPct', e.target.value)} className="h-8 w-20" />
                        </td>
                      )}
                      <td className="px-3 py-1.5">
                        <Input type="number" step="0.01" min={0} value={d.pricePerUnit} onChange={(e) => setField(row.id, 'pricePerUnit', e.target.value)} className="h-8 w-28 font-semibold" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={d.isActive} onChange={(e) => setField(row.id, 'isActive', e.target.checked)} className="h-4 w-4 accent-brand" aria-label={t.admin.rateActive} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Button type="button" size="sm" variant={dirty(row) ? 'default' : 'outline'} disabled={!dirty(row) || state === 'saving'} onClick={() => save(row)}>
                          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'saved' ? <Check className="h-4 w-4" /> : null}
                          {state === 'saved' ? t.admin.rateSaved : state === 'error' ? t.admin.rateSaveError : t.admin.rateSave}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {rows.length === 0 && <p className="text-sm text-ink-muted">{t.admin.rateDefaultsHint}</p>}
      {renderGroup('material', groups.material)}
      {renderGroup('labour', groups.labour)}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-serif text-lg font-semibold">{t.admin.rateAdd}</h2>
          <p className="text-xs text-ink-muted">{t.admin.rateAddHint}</p>
          <div className="grid gap-2 md:grid-cols-4">
            <Input placeholder="key" value={newRate.key} onChange={(e) => setNewRate({ ...newRate, key: e.target.value })} />
            <Input placeholder={t.admin.table.name} value={newRate.labelKa} onChange={(e) => setNewRate({ ...newRate, labelKa: e.target.value })} className="md:col-span-2" />
            <Input type="number" placeholder={t.admin.ratePhase} value={newRate.phase} onChange={(e) => setNewRate({ ...newRate, phase: e.target.value })} />
            <select value={newRate.unit} onChange={(e) => setNewRate({ ...newRate, unit: e.target.value })} className="h-10 rounded-md border border-line bg-bg-surface px-2 text-sm">
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <select value={newRate.basis} onChange={(e) => setNewRate({ ...newRate, basis: e.target.value })} className="h-10 rounded-md border border-line bg-bg-surface px-2 text-sm">
              {BASES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <Input type="number" step="0.001" placeholder={t.admin.rateQtyPerM2} value={newRate.qtyPerM2} onChange={(e) => setNewRate({ ...newRate, qtyPerM2: e.target.value })} />
            <Input type="number" placeholder={t.admin.rateWaste} value={newRate.wasteFactorPct} onChange={(e) => setNewRate({ ...newRate, wasteFactorPct: e.target.value })} />
            <Input type="number" step="0.01" placeholder={t.admin.ratePrice} value={newRate.pricePerUnit} onChange={(e) => setNewRate({ ...newRate, pricePerUnit: e.target.value })} />
          </div>
          {addError && <p className="text-sm text-danger">{addError}</p>}
          <Button type="button" onClick={add} disabled={adding || !newRate.key || !newRate.labelKa}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t.admin.rateAdd}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
