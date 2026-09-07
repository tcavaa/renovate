import { requireAdmin } from '@/lib/api/route';
import { ordersForExport } from '@/lib/finance/report';
import { periodRange, type ReportPeriod, REPORT_PERIODS } from '@/lib/finance/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cell(v: unknown): string {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The orders of a period as CSV — the accountant's view of the revenue page. */
export async function GET(req: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const url = new URL(req.url);
  const periodParam = url.searchParams.get('period') ?? '30d';
  const period = (REPORT_PERIODS as readonly string[]).includes(periodParam) ? (periodParam as ReportPeriod) : '30d';
  const range = periodRange(period, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
  const rows = await ordersForExport(range);
  const head = ['order_id', 'created_at', 'partner_type', 'partner', 'status', 'customer', 'phone', 'subtotal_gel', 'delivery_gel', 'commission_pct', 'commission_gel', 'project_id', 'checkout_id'];
  const lines = rows.map((r) =>
    [r.id, r.createdAt, r.partnerType, r.storeName ?? r.workerName ?? '', r.status, r.customerName, r.customerPhone, r.subtotal, r.deliveryFee, r.commissionPct, r.commissionAmount, r.projectId ?? '', r.checkoutId ?? '']
      .map(cell)
      .join(',')
  );
  const body = '﻿' + [head.join(','), ...lines].join('\n');
  const name = `orders-${range.from.toISOString().slice(0, 10)}-${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
  });
}
