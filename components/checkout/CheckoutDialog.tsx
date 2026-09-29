'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ChevronDown, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContactFields, contactBody, newContactForm, type ContactForm } from '@/components/checkout/ContactFields';
import { useAccountContact } from '@/hooks/useAccountContact';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage, localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import type { CheckoutPreview, CheckoutResult, ProjectOrderState } from '@/lib/finance/orders';
import { lineTotal, round2, type CheckoutKind } from '@/lib/finance/money';
import { cn, formatGEL, formatNumber } from '@/lib/utils';

/** One half of a project as the dialog lists it: the products it would send. */
export interface CheckoutPart {
  kind: CheckoutKind;
  /**
   * `unitPrice` lets a line partly ordered before be shown as the units still to send, priced
   * as the server prices them; `furniture` puts it under furniture rather than building
   * materials (the budget line's `bucket`).
   */
  lines: Array<{ key: string; productId: number | null; name: string; qty: number; unitPrice?: number; total: number; where: string | null; furniture: boolean }>;
}

/** Where the thank-you sends the person, and how long it waits first. */
const ORDERS_HREF = '/profile?view=orders';
const THANK_YOU_MS = 4000;

/**
 * The step that turns an estimate into business. The dialog reads what the project comes to in
 * three rows — the building materials (the rate book's construction materials, which go to
 * their supplier, and every store product that is not furniture: finishes, doors, windows,
 * fittings, radiators), the summary's reserve (15 % of the renovation's materials and labour —
 * on nobody's order; shown on the first order only) and the furniture — and the total under
 * them. The platform's fee is not here: each half paid it before its hinge.
 *
 * The contact is the account's: a signed-in person is asked only for the phone and the
 * delivery address their profile does not have, and may keep them as the default
 * (`ContactFields`). The caller saves the project (each summary in its own shape), then the
 * platform writes one order per store; a project ordered before sends only what is new. On
 * success a thank-you, and then the person's orders (`/profile?view=orders`).
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  saveProject,
  projectId,
  parts,
  onOrdered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves (or reuses) the project and returns its id; throws on failure. */
  saveProject: () => Promise<number>;
  /** The saved project, when known, so earlier checkouts of it can be shown. */
  projectId: number | null;
  parts: CheckoutPart[];
  /** Called once an order went through — a page showing the orders can refresh itself. */
  onOrdered?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { account, ready } = useAccountContact(open);
  const [form, setForm] = useState<ContactForm | null>(null);
  const value = form ?? newContactForm(account);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [state, setState] = useState<(ProjectOrderState & CheckoutPreview) | null>(null);
  const [full, setFull] = useState(false);

  // What earlier sittings already ordered, the materials and the reserve, so the preview matches
  // what the server will do.
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    fetch(`/api/checkout?projectId=${projectId}`)
      .then((r) => r.json())
      .then((json: { data: (ProjectOrderState & CheckoutPreview) | null }) => {
        if (!cancelled) setState(json.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  // The thank-you stays a moment, then the person's orders open — from the top of the page:
  // the summary behind the dialogue is usually scrolled far down.
  useEffect(() => {
    if (!result) return;
    const handle = window.setTimeout(() => {
      window.scrollTo({ top: 0 });
      router.push(ORDERS_HREF);
    }, THANK_YOU_MS);
    return () => window.clearTimeout(handle);
  }, [result, router]);

  // Same rules the server applies: the design's lines win over the calculator's copies of a
  // product, and units ordered earlier are taken off the top, product by product.
  const designProducts = new Set(parts.filter((p) => p.kind === 'design').flatMap((p) => p.lines.map((l) => l.productId)).filter((id): id is number => id != null));
  const covered: Record<number, number> = {};
  for (const [key, qty] of Object.entries(state?.orderedQty ?? {})) covered[Number(key)] = qty;
  const marked = new Map<string, boolean>();
  // A line partly ordered before goes out as what is left of it. The design's lines are the
  // budget's, folded per product — twelve sockets are one line — so a thirteenth added after
  // the first order is the ordinary case, and it is one socket that is sent, not thirteen.
  const partly = new Map<string, { qty: number; total: number }>();
  for (const part of [...parts.filter((p) => p.kind === 'design'), ...parts.filter((p) => p.kind !== 'design')]) {
    for (const line of part.lines) {
      if (line.productId == null) {
        marked.set(line.key, false);
        continue;
      }
      if (part.kind !== 'design' && designProducts.has(line.productId)) {
        marked.set(line.key, true);
        continue;
      }
      const remaining = covered[line.productId] ?? 0;
      if (remaining >= line.qty) {
        covered[line.productId] = remaining - line.qty;
        marked.set(line.key, true);
        continue;
      }
      if (remaining > 0) {
        const qty = round2(line.qty - remaining);
        partly.set(line.key, { qty, total: lineTotal(qty, line.unitPrice ?? (line.qty > 0 ? line.total / line.qty : 0)) });
      }
      covered[line.productId] = 0;
      marked.set(line.key, false);
    }
  }
  const lines = parts.flatMap((part) => part.lines.map((line) => ({ ...line, ...partly.get(line.key), duplicate: marked.get(line.key) ?? false })));
  const sending = lines.filter((l) => !l.duplicate);
  const productLines = sending.filter((l) => !l.furniture);
  const furnitureLines = sending.filter((l) => l.furniture);
  const skipped = lines.length - sending.length;

  // The construction materials go to their supplier; the server says what they come to (read
  // off the saved project as the checkout will read it), and what the summary's reserve is.
  const loaded = state != null;
  const materials = state?.materials ?? null;
  const supplierTotal = materials?.storeId != null ? materials.total : 0;
  const materialsTotal = round2(supplierTotal + productLines.reduce((s, l) => s + l.total, 0));
  const furnitureTotal = round2(furnitureLines.reduce((s, l) => s + l.total, 0));
  // The reserve belongs to the project, not to a sitting: it is counted on the first order only.
  const firstOrder = (state?.orderedKinds.length ?? 0) === 0;
  const reserve = state && firstOrder ? state.reserve : 0;
  const total = round2(materialsTotal + reserve + furnitureTotal);
  const materialCount = productLines.length + (materials?.storeId != null ? materials.lines.length : 0);
  /** What a row says under its name: how many lines go, or that they went with an earlier order, or that there are none. */
  const rowHint = (sent: number, furniture: boolean) => (sent > 0 ? fill(t.market.itemsCount, { n: sent }) : lines.some((l) => l.furniture === furniture) ? t.market.rowOrdered : t.market.rowEmpty);
  // Everything already sent: say so instead of letting the server refuse.
  const nothingNew = loaded && supplierTotal === 0 && sending.length === 0;

  // Closing forgets the sitting: the next opening starts from a fresh form and re-reads what
  // has been ordered.
  const close = (next: boolean) => {
    if (!next) {
      setResult(null);
      setError(null);
      setFull(false);
      setState(null);
      setForm(null);
    }
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const id = await saveProject();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, customer: contactBody(value, account, { address: true }) }),
      });
      const json = (await res.json()) as { data: CheckoutResult | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setResult(json.data);
      onOrdered?.();
    } catch (err) {
      setError((err as Error).message === 'save-failed' ? t.market.saveFirstError : apiErrorMessage(t, (err as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const figure = (amount: number) => (loaded ? formatGEL(amount) : <Loader2 className="ml-auto h-4 w-4 animate-spin text-ink-faint" aria-label={t.common.loading} />);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        {result ? (
          <div className="py-2 text-center">
            <div className="mx-auto grid h-16 w-16 animate-scale-in place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogHeader className="mt-4 space-y-2">
              <DialogTitle className="text-center font-serif text-2xl">{t.market.thankYouTitle}</DialogTitle>
              <DialogDescription className="text-center text-base leading-relaxed">{fill(t.market.thankYouDesc, { id: result.checkoutId })}</DialogDescription>
            </DialogHeader>
            {result.orders.length > 0 && <p className="mt-3 text-sm text-ink-muted">{fill(t.market.thankYouStores, { n: result.orders.length })}</p>}
            {result.unassigned > 0 && <p className="mt-2 text-xs text-warning">{fill(t.market.noPartnerItems, { n: result.unassigned })}</p>}
            <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-line">
              <div className="h-full w-full origin-left animate-countdown bg-ink" style={{ animationDuration: `${THANK_YOU_MS}ms` }} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">{t.market.redirectingToOrders}</p>
            <Button
              type="button"
              variant="ink"
              className="mt-5 w-full"
              onClick={() => {
                window.scrollTo({ top: 0 });
                router.push(ORDERS_HREF);
              }}
            >
              {t.market.goToOrders}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t.market.checkoutTitle}</DialogTitle>
              <DialogDescription>{t.market.checkoutDesc}</DialogDescription>
            </DialogHeader>

            {/* What it comes to: building materials, their reserve, the furniture, and the total. */}
            <div className="border border-line text-sm">
              <Row label={t.market.rowMaterials} amount={figure(materialsTotal)} hint={loaded ? rowHint(materialCount, false) : null}>
                {materials?.storeId == null && materials != null && <span className="text-warning">{t.orderReview.materialsNoSupplier}</span>}
              </Row>
              {(!loaded || reserve > 0) && <Row label={t.market.rowReserve} amount={figure(reserve)} hint={t.market.rowReserveHint} />}
              <Row label={t.market.rowFurniture} amount={formatGEL(furnitureTotal)} hint={rowHint(furnitureLines.length, true)} />
              <div className="flex items-baseline justify-between gap-3 border-t-2 border-ink px-4 py-3">
                <span className="font-semibold text-ink">{t.market.total}</span>
                <span className="font-serif text-xl font-semibold tabular-nums text-ink">{loaded ? formatGEL(total) : '…'}</span>
              </div>
            </div>
            <p className="text-xs text-ink-muted">{t.market.deliveryNote}</p>

            {nothingNew ? (
              <p className="border border-line bg-bg-base px-3 py-2 text-sm text-ink-muted">{t.market.nothingToOrder}</p>
            ) : (
              skipped > 0 && <p className="text-xs text-ink-muted">{fill(t.market.alreadyOrderedLines, { n: skipped })}</p>
            )}

            <button type="button" onClick={() => setFull((f) => !f)} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-brand">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', full && 'rotate-180')} />
              {full ? t.market.hideFull : t.market.showFull}
            </button>
            {full && (
              <div className="max-h-56 overflow-y-auto border border-line text-xs">
                <FullGroup title={t.market.rowMaterials}>
                  {(materials?.storeId != null ? materials.lines : []).map((line) => (
                    <FullLine key={line.categorySlug ?? line.nameKa} name={localizedName(locale, line)} qty={line.qty} total={line.total} />
                  ))}
                  {lines
                    .filter((l) => !l.furniture)
                    .map((line) => (
                      <FullLine key={line.key} name={line.name} where={line.where} qty={line.qty} total={line.total} struck={line.duplicate} />
                    ))}
                </FullGroup>
                <FullGroup title={t.market.rowFurniture}>
                  {lines
                    .filter((l) => l.furniture)
                    .map((line) => (
                      <FullLine key={line.key} name={line.name} where={line.where} qty={line.qty} total={line.total} struck={line.duplicate} />
                    ))}
                </FullGroup>
              </div>
            )}

            {ready ? <ContactFields account={account} value={value} onChange={setForm} /> : <div className="h-24 animate-pulse border border-line bg-bg-base" aria-busy />}
            {error && <p className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" variant="ink" size="lg" className="w-full" disabled={submitting || nothingNew || !ready}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? t.market.submitting : t.market.submit}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One of the three rows: what, how many, and what it comes to. */
function Row({ label, amount, hint, children }: { label: string; amount: React.ReactNode; hint: string | null; children?: React.ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-ink">{label}</span>
        <span className="shrink-0 tabular-nums">{amount}</span>
      </div>
      {(hint || children) && (
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
          {hint && <span>{hint}</span>}
          {children}
        </p>
      )}
    </div>
  );
}

/** A group of the full list: its title, then its lines (or a dash). */
function FullGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div>
      <p className="border-b border-line bg-bg-base px-3 py-1.5 font-semibold uppercase tracking-[0.12em] text-ink-muted">{title}</p>
      <ul className="divide-y divide-line/70">{items.length > 0 ? items : <li className="px-3 py-2 text-ink-muted">—</li>}</ul>
    </div>
  );
}

function FullLine({ name, where, qty, total, struck = false }: { name: string; where?: string | null; qty: number; total: number; struck?: boolean }) {
  return (
    <li className={cn('flex items-baseline justify-between gap-3 px-3 py-1.5', struck && 'text-ink-faint line-through')}>
      <span className="min-w-0 truncate">
        {name}
        {where && <span className="ml-1 text-ink-muted no-underline">· {where}</span>}
      </span>
      <span className="shrink-0 tabular-nums">
        {qty !== 1 && <span className="mr-1 text-ink-muted">{formatNumber(qty)} ×</span>}
        {formatGEL(total)}
      </span>
    </li>
  );
}
