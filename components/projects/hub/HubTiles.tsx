'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Box, Calculator, Loader2, PencilRuler, Upload, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { designStepHref } from '@/lib/design/steps';
import { useT } from '@/lib/i18n/client';

/** How step 1 opens (`?way=`): on the upload card, or on a blank sheet to draw on. */
type Way = 'draw' | 'upload';

/** A project the "from the other product" tile offers, with its drawing already rendered on the server. */
export interface HubPick {
  id: number;
  name: string;
  /** "Changed …", already worded. */
  date: string;
  href: string;
  thumbnail: ReactNode;
}

interface Tile {
  icon: LucideIcon;
  title: string;
  description: string;
  /** A new project that opens step 1 this way — or, without one, the picker. */
  way: Way | null;
}

/**
 * The ways to start, as tiles: two make a new project (named first, in a dialogue) and open its
 * first step on the upload card or the blank sheet; the third starts this product's half of a
 * project the person already has in the other product, chosen from a list.
 */
export function HubTiles({ journey, defaultName, picks }: { journey: 'calculator' | 'design'; defaultName: string; picks: HubPick[] }) {
  const t = useT();
  const router = useRouter();
  const calculator = journey === 'calculator';
  const [way, setWay] = useState<Way | null>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  const tiles: Tile[] = calculator
    ? [
        { icon: PencilRuler, title: t.hub.tileDraw, description: t.hub.tileDrawDesc, way: 'draw' },
        { icon: Upload, title: t.hub.tileUpload, description: t.hub.tileUploadDesc, way: 'upload' },
        { icon: Box, title: t.hub.tileFromDesign, description: t.hub.tileFromDesignDesc, way: null },
      ]
    : [
        { icon: Upload, title: t.hub.tileUpload, description: t.hub.tileUploadDesc, way: 'upload' },
        { icon: PencilRuler, title: t.hub.tileBlank, description: t.hub.tileBlankDesc, way: 'draw' },
        { icon: Calculator, title: t.hub.tileFromCalc, description: t.hub.tileFromCalcDesc, way: null },
      ];

  const choose = (tile: Tile) => {
    if (!tile.way) {
      setPicking(true);
      return;
    }
    setName(defaultName);
    setFailed(false);
    setWay(tile.way);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!way || !trimmed || creating) return;
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
      router.push(`${first}?way=${way}`);
    } catch {
      setCreating(false);
      setFailed(true);
    }
  };

  return (
    <>
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <button
            key={tile.title}
            type="button"
            onClick={() => choose(tile)}
            aria-haspopup="dialog"
            className="group flex items-start gap-4 border border-line bg-bg-surface p-5 text-left transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-sand text-ink transition-colors group-hover:bg-ink group-hover:text-white">
              <tile.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{tile.title}</span>
              <span className="mt-1 block text-sm leading-snug text-ink-muted">{tile.description}</span>
            </span>
          </button>
        ))}
      </div>

      <Dialog
        open={way != null}
        onOpenChange={(open) => {
          if (!open && !creating) setWay(null);
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
              <Button type="button" variant="outline" onClick={() => setWay(null)} disabled={creating}>
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
