'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Box, Calculator, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { designStepHref } from '@/lib/design/steps';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** A project the "from the other product" tile offers, with its drawing already rendered on the server. */
export interface HubPick {
  id: number;
  name: string;
  /** "Changed …", already worded. */
  date: string;
  href: string;
  thumbnail: ReactNode;
}

/**
 * The ways to start, as a row of round buttons over the projects: **a new project** — named
 * first, in a dialogue, then its first step, where the plan is uploaded or drawn (step 1 offers
 * both) — and this product's half of a project the person already has in the other product,
 * chosen from a list.
 */
export function HubTiles({ journey, defaultName, picks }: { journey: 'calculator' | 'design'; defaultName: string; picks: HubPick[] }) {
  const t = useT();
  const router = useRouter();
  const calculator = journey === 'calculator';
  const [naming, setNaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  const startNew = () => {
    setName(defaultName);
    setFailed(false);
    setNaming(true);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!naming || !trimmed || creating) return;
    setCreating(true);
    setFailed(false);
    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, journey }),
      });
      const json = (await res.json().catch(() => null)) as { data: { id: number } | null; error: string | null } | null;
      const id = json?.data?.id;
      if (!res.ok || !id) throw new Error(json?.error ?? 'create-failed');
      const first = calculator ? calculatorStepHref(id, 1) : designStepHref(id, 1);
      // Still "creating" while the first step loads: a second press would make a second project.
      router.push(first);
    } catch {
      setCreating(false);
      setFailed(true);
    }
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-start gap-x-8 gap-y-5">
        <RoundAction icon={<Plus className="h-7 w-7" strokeWidth={2.25} />} label={t.hub.createProject} title={calculator ? t.hub.newCalculatorLead : t.hub.newDesignLead} className="bg-brand group-hover:bg-brand-dark" onClick={startNew} />
        <span className="mt-4 hidden h-9 w-px bg-line sm:block" aria-hidden />
        <RoundAction
          icon={calculator ? <Box className="h-6 w-6" /> : <Calculator className="h-6 w-6" />}
          label={calculator ? t.hub.tileFromDesign : t.hub.tileFromCalc}
          title={calculator ? t.hub.tileFromDesignDesc : t.hub.tileFromCalcDesc}
          className="bg-slate-deep group-hover:bg-ink"
          onClick={() => setPicking(true)}
        />
      </div>

      <Dialog
        open={naming}
        onOpenChange={(open) => {
          if (!open && !creating) setNaming(false);
        }}
      >
        <DialogContent>
          <form onSubmit={create} className="grid gap-5">
            <DialogHeader className="pr-6">
              <DialogTitle>{t.hub.newTitle}</DialogTitle>
              <DialogDescription>{calculator ? t.hub.newCalculatorLead : t.hub.newDesignLead}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="hub-new-project-name">{t.hub.nameLabel}</Label>
              <Input
                id="hub-new-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder={t.hub.namePlaceholder}
                maxLength={120}
                autoFocus
                required
                disabled={creating}
              />
            </div>
            {failed && (
              <p role="alert" className="text-sm text-danger">
                {t.hub.createFailed}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNaming(false)} disabled={creating}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="ink" disabled={creating || !name.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? t.hub.creating : t.hub.create}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="pr-6">
            <DialogTitle>{calculator ? t.hub.pickFromDesignTitle : t.hub.pickFromCalcTitle}</DialogTitle>
            <DialogDescription>{calculator ? t.hub.pickFromDesignLead : t.hub.pickFromCalcLead}</DialogDescription>
          </DialogHeader>
          {picks.length === 0 ? (
            <p className="border border-dashed border-line p-8 text-center text-sm text-ink-muted">{t.hub.pickEmpty}</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto border-t border-line">
              {picks.map((pick) => (
                <li key={pick.id} className="border-b border-line">
                  <Link href={pick.href} className="group flex items-center gap-4 px-1 py-3 hover:bg-bg-base focus-visible:bg-bg-base focus-visible:outline-none">
                    <span className="block h-12 w-16 shrink-0 overflow-hidden border border-line">{pick.thumbnail}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink group-hover:text-brand">{pick.name}</span>
                      <span className="block text-xs text-ink-muted">{pick.date}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint group-hover:text-brand" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One of the row's round buttons: a coloured circle with its icon, its name under it. */
function RoundAction({ icon, label, title, className, onClick }: { icon: ReactNode; label: string; title: string; className: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-haspopup="dialog" className="group flex w-36 flex-col items-center gap-2.5 text-center focus-visible:outline-none">
      <span className={cn('grid h-16 w-16 place-items-center rounded-full text-white shadow-card transition-all group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-brand/50 group-focus-visible:ring-offset-2', className)}>{icon}</span>
      <span className="text-sm font-medium leading-snug text-ink-soft transition-colors group-hover:text-ink">{label}</span>
    </button>
  );
}
