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

/**
 * "Book this worker": contact details and, for a signed-in customer, one of their saved
 * projects so the booking carries the labour estimate. The worker gets the mail, the
 * platform gets its commission line.
 */
export function BookingDialog({ workerId, workerName }: { workerId: number; workerName: string }) {
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
    if (!open || status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/projects')
      .then((r) => r.json())
      .then((json: { data: ProjectOption[] | null }) => {
        if (!cancelled) setProjects((json.data ?? []).filter((p) => !p.plan));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId, projectId, customer: { name: value.name, phone: value.phone, email: value.email || null, note: value.note || null } }),
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
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
        <Hammer className="h-4 w-4" />
        {t.market.bookWorker}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
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
              <Button type="button" variant="ink" className="w-full" onClick={() => setOpen(false)}>
                {t.market.close}
              </Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{fill(t.market.bookTitle, { name: workerName })}</DialogTitle>
                <DialogDescription>{t.market.bookDesc}</DialogDescription>
              </DialogHeader>
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
