'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowUpRight, Box, Calculator, FileText, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteProject } from '@/components/projects/DeleteProjectButton';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** The way into the other product, worded as the profile words it. */
export interface OtherJourney {
  href: string;
  label: 'openIn3d' | 'createIn3d' | 'openInCalculator' | 'calculateCosts';
}

const ITEM = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-bg-base focus:bg-bg-base focus:outline-none';

/**
 * A project card's "…": open it, rename it, open (or start) its other half, its page, delete
 * it. A small menu of our own — there is no dropdown primitive here — that behaves like one:
 * it opens on its first item, the arrows move through it, Escape and a click anywhere else
 * close it, and focus comes back to the button.
 */
export function ProjectCardMenu({ projectId, name, openHref, other, canDelete }: { projectId: number; name: string; openHref: string; other: OtherJourney | null; canDelete: boolean }) {
  const t = useT();
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') setOpen(false);
    if (next == null) return;
    event.preventDefault();
    items[next].focus();
  };

  const startRename = () => {
    setOpen(false);
    setDraft(name);
    setError(null);
    setRenaming(true);
  };

  const startDelete = () => {
    setOpen(false);
    setError(null);
    setDeleting(true);
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error('rename-failed');
      setRenaming(false);
      router.refresh();
    } catch {
      setError(t.hub.renameFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const failed = await deleteProject(projectId).catch(() => 'UNKNOWN');
    setBusy(false);
    if (failed) {
      setError(t.hub.deleteFailed);
      return;
    }
    setDeleting(false);
    router.refresh();
  };

  // The dialogues are opened from the menu, which is gone by then: focus goes back to the "…".
  const backToButton = (event: Event) => {
    event.preventDefault();
    buttonRef.current?.focus();
  };

  const OtherIcon = other?.label === 'openIn3d' || other?.label === 'createIn3d' ? Box : Calculator;

  return (
    <div ref={rootRef} className="relative -mr-1.5 -mt-1 shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={t.hub.menuLabel}
        title={t.hub.menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn('flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-bg-base hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50', open && 'bg-bg-base text-ink')}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label={t.hub.menuLabel} onKeyDown={moveFocus} className="absolute right-0 top-full z-30 mt-1 w-60 border border-line bg-bg-surface py-1 shadow-card">
          <Link href={openHref} role="menuitem" tabIndex={-1} className={ITEM} onClick={() => setOpen(false)}>
            <ArrowUpRight className="h-4 w-4 text-ink-muted" aria-hidden />
            {t.hub.open}
          </Link>
          <button type="button" role="menuitem" tabIndex={-1} className={ITEM} onClick={startRename}>
            <Pencil className="h-4 w-4 text-ink-muted" aria-hidden />
            {t.hub.rename}
          </button>
          {other && (
            <Link href={other.href} role="menuitem" tabIndex={-1} className={ITEM} onClick={() => setOpen(false)}>
              <OtherIcon className="h-4 w-4 text-ink-muted" aria-hidden />
              {t.profile[other.label]}
            </Link>
          )}
          <Link href={`/profile/projects/${projectId}`} role="menuitem" tabIndex={-1} className={ITEM} onClick={() => setOpen(false)}>
            <FileText className="h-4 w-4 text-ink-muted" aria-hidden />
            {t.hub.projectPage}
          </Link>
          {canDelete && (
            <>
              <div role="separator" className="my-1 border-t border-line" />
              <button type="button" role="menuitem" tabIndex={-1} className={cn(ITEM, 'text-danger hover:text-danger')} onClick={startDelete}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t.hub.delete}
              </button>
            </>
          )}
        </div>
      )}

      <Dialog
        open={renaming}
        onOpenChange={(value) => {
          if (!busy) setRenaming(value);
        }}
      >
        <DialogContent onCloseAutoFocus={backToButton}>
          <form onSubmit={rename} className="grid gap-5">
            <DialogHeader className="pr-6">
              <DialogTitle>{t.hub.renameTitle}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`${menuId}-name`}>{t.hub.nameLabel}</Label>
              <Input id={`${menuId}-name`} value={draft} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.currentTarget.select()} placeholder={t.hub.namePlaceholder} maxLength={120} autoFocus required disabled={busy} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenaming(false)} disabled={busy}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="ink" disabled={busy || !draft.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.hub.renameSave}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting}
        onOpenChange={(value) => {
          if (!busy) setDeleting(value);
        }}
      >
        <DialogContent onCloseAutoFocus={backToButton}>
          <DialogHeader className="pr-6">
            <DialogTitle>{t.profile.deleteProject}</DialogTitle>
            <DialogDescription>{t.profile.deleteProjectConfirm}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleting(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t.hub.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
