'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, Hammer, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomerFields, type CustomerForm } from '@/components/checkout/CustomerFields';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatM2 } from '@/lib/utils';

interface ProjectOption {
  id: number;
  nameKa: string | null;
  totalM2: string | number;
  totalWorkersCost: string | number | null;
  plan: unknown;
}

/** The project a booking is for, when it is made from inside that project's own flow. */
export interface BookingProject {
  /** Saves the project if it is not saved yet and returns its id — the booking is attached to it. */
  ensure: () => Promise<number>;
  /** What is being sent: how many labour lines the budget holds, and what they come to. */
  lines: number;
  total: number;
}

/**
 * "Send them the job": contact details and the project whose work it is. One trade
 * (`workerId`) or a whole brigade (`teamId`) — a team's booking carries every trade's lines,
 * because a team is hired to do the lot. The partner gets the mail and the order in their
 * own account, where they accept it; the platform gets its commission line.
 *
 * From a directory page the customer attaches one of their saved projects, or none. From
 * the last step of the design (`project`) there is nothing to choose: it is *this* flat's
 * work, as it was left on the budget, and the dialogue saves the design first if it has to —
 * picking "which project?" out of a list, on the last step of that very project, was the
 * one question there that had an obvious answer.
 */
export function BookingDialog({ workerId, teamId, workerName, label, project, onBooked, disabled, variant = 'outline' }: { workerId?: number; teamId?: number; workerName: string; label?: string; project?: BookingProject; onBooked?: (orderId: number) => void; disabled?: boolean; variant?: 'outline' | 'ink' }) {
  const t = useT();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm | null>(null);
  // Until the customer types, the form shows what the session knows — no effect needed.
  const value: CustomerForm = form ?? { name: session?.user?.name ?? '', phone: '', email: session?.user?.email ?? '', note: '' };
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || status !== 'authenticated' || project) return;
    let cancelled = false;
    fetch('/api/projects')
      .then((r) => r.json())
      .then((json: { data: ProjectOption[] | null }) => {
        // A brigade is hired for a flat that has been designed as well as calculated, so a
        // team's dialogue offers every project; one trade is still booked off a calculation.
        if (!cancelled) setProjects((json.data ?? []).filter((p) => (teamId ? true : !p.plan)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, status, teamId, project]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Inside a project's own flow the booking is for that project, saved now if need be.
      const attached = project ? await project.ensure() : projectId;
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(teamId ? { teamId } : { workerId }), projectId: attached, customer: { name: value.name, phone: value.phone, email: value.email || null, note: value.note || null } }),
      });
      const json = (await res.json()) as { data: { orderId: number } | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setDoneId(json.data.orderId);
    } catch {
      setError(apiErrorMessage(t, null));
    } finally {
      setSubmitting(false);
    }
  };

  const selected = projects.find((p) => p.id === projectId) ?? null;

  return (
    <>
      <Button type="button" variant={variant} size="lg" onClick={() => setOpen(true)} disabled={disabled}>
        <Hammer className="h-4 w-4" />
        {label ?? t.market.bookWorker}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Told only once the "sent" message has been read and closed: the page this sits on
          // may well stop showing the button — and this dialogue with it — the moment it knows.
          if (!next && doneId != null) onBooked?.(doneId);
        }}
      >
        <DialogContent className="max-w-lg">
          {doneId != null ? (
            <>
              <DialogHeader>
                <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <DialogTitle className="text-center">{t.market.bookSuccessTitle}</DialogTitle>
                <DialogDescription className="text-center">{fill(t.market.bookSuccessDesc, { id: doneId })}</DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                variant="ink"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  if (doneId != null) onBooked?.(doneId);
                }}
              >
                {t.market.close}
              </Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{fill(t.market.bookTitle, { name: workerName })}</DialogTitle>
                <DialogDescription>{project ? t.teams.chooseHint : t.market.bookDesc}</DialogDescription>
              </DialogHeader>
              {project ? (
                <div className="border border-line bg-bg-base px-3 py-2.5">
                  <p className="text-sm font-medium text-ink">{t.teams.thisProject}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{fill(t.teams.thisProjectLines, { n: project.lines, total: formatGEL(project.total) })}</p>
                </div>
              ) : (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t.market.attachProject}</span>
                {status === 'authenticated' ? (
                  <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} className="h-10 w-full border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none">
                    <option value="">{t.market.noProject}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id} · {p.nameKa ?? t.profile.fallbackName} · {formatM2(Number(p.totalM2))}
                        {p.totalWorkersCost ? ` · ${formatGEL(Number(p.totalWorkersCost))}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="border border-dashed border-line px-3 py-2 text-xs text-ink-muted">{t.market.loginToAttach}</p>
                )}
                {selected && selected.totalWorkersCost && <span className="block text-xs text-ink-muted">{t.summary.workers}: {formatGEL(Number(selected.totalWorkersCost))}</span>}
              </label>
              )}
              <CustomerFields value={value} onChange={setForm} />
              {error && <p className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" variant="ink" size="lg" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? t.market.submitting : t.market.bookSubmit}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
