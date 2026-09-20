'use client';

/**
 * The studio's top bar: the room in focus and the autosave state on the left; the view
 * switch, walls, start-from-scratch, time of day and photo in the middle; undo/redo, the structure
 * lock, versions, help and the way to the next step on the right.
 */

import Link from 'next/link';
import { ArrowUpRight, Check, History, HelpCircle, Loader2, Lock, LockOpen, Redo2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ViewSwitch, type StudioView } from '@/components/design/StudioControls';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { DaylightPreset } from '@/lib/design3d/daylight';

export function StudioTopBar({ roomLabel, itemCount, saveState, view, onView, showWalls, onToggleWalls, onClear, daylight, onDaylight, onPhoto, canUndo, canRedo, onUndo, onRedo, locked, onToggleLock, versionsOpen, onVersions, onHelp, nextHref, nextLabel }: { roomLabel: string; itemCount: number; saveState: 'idle' | 'saving' | 'saved' | 'error'; view: StudioView; onView: (view: StudioView) => void; showWalls: boolean; onToggleWalls: () => void; onClear: () => void; daylight: DaylightPreset; onDaylight: (preset: DaylightPreset) => void; onPhoto?: () => void; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; locked: boolean; onToggleLock: () => void; versionsOpen: boolean; onVersions: () => void; onHelp: () => void; nextHref: string; nextLabel: string }) {
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex flex-wrap items-start justify-between gap-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-[14px] bg-white/85 py-1.5 pl-4 pr-2 shadow-glass backdrop-blur-xl">
        <span className="text-sm font-medium">{roomLabel}</span>
        <Badge variant="outline">{itemCount}</Badge>
        {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-label={t.design.saving} />}
        {saveState === 'saved' && (
          <span className="flex items-center gap-1 text-[11px] text-ink-muted" title={t.design.autosaved}>
            <Check className="h-3 w-3 text-success" />
            {t.design.autosaved}
          </span>
        )}
        <span className="mx-1 h-5 w-px bg-line" />
        <span className="flex items-center" data-tour="history">
          <button type="button" onClick={onUndo} disabled={!canUndo} title={`${t.build.undo} · Ctrl+Z`} aria-label={t.build.undo} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-soft hover:bg-sand-light hover:text-ink disabled:opacity-30">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo} title={`${t.build.redo} · Ctrl+Y`} aria-label={t.build.redo} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-soft hover:bg-sand-light hover:text-ink disabled:opacity-30">
            <Redo2 className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className="pointer-events-auto">
        <ViewSwitch view={view} onView={onView} showWalls={showWalls} onToggleWalls={onToggleWalls} onClear={onClear} daylight={daylight} onDaylight={onDaylight} onPhoto={onPhoto} />
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={!locked}
          data-tour="lock"
          title={locked ? t.build.unlockStructure : t.build.lockStructure}
          className={cn('flex h-10 items-center gap-2 rounded-[12px] px-3 text-xs font-semibold shadow-glass backdrop-blur-xl transition-colors', locked ? 'bg-white/85 text-ink-soft hover:text-ink' : 'bg-brand text-white')}
        >
          {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          {locked ? t.build.unlockStructure : t.build.lockStructure}
        </button>
        <button type="button" onClick={onVersions} aria-pressed={versionsOpen} title={t.build.versions} data-tour="versions" className={cn('flex h-10 items-center gap-2 rounded-[12px] px-3 text-xs font-semibold shadow-glass backdrop-blur-xl', versionsOpen ? 'bg-ink text-white' : 'bg-white/85 text-ink-soft hover:text-ink')}>
          <History className="h-4 w-4" />
          {t.build.versions}
        </button>
        <button type="button" onClick={onHelp} title={t.build.help} aria-label={t.build.help} className="grid h-10 w-10 place-items-center rounded-[12px] bg-white/85 text-ink-soft shadow-glass backdrop-blur-xl hover:text-ink">
          <HelpCircle className="h-4 w-4" />
        </button>
        <Link href={nextHref} className="group inline-flex h-10 items-center gap-2 rounded-[12px] bg-ink pl-4 pr-3 text-sm font-medium text-white shadow-float transition-colors hover:bg-brand">
          {nextLabel}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
