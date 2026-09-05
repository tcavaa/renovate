import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { BadgeCheck, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminWorkersPage() {
  const ka = getT();
  const rows = await db.select().from(workers).orderBy(desc(workers.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold">{ka.admin.workers}</h1>
        <Button asChild>
          <Link href="/admin/workers/new">
            <Plus className="h-4 w-4" /> {ka.admin.actions.create}
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.table.specialty}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.price}</th>
                <th className="px-4 py-3">{ka.admin.table.rating}</th>
                <th className="px-4 py-3">{ka.admin.table.status}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-line/40 last:border-0 hover:bg-bg-base/50"
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {w.nameKa}
                      {w.isVerified && (
                        <BadgeCheck className="h-4 w-4 text-success" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {workerSpecialtyLabel(ka, w.specialtySlug ?? w.specialty)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {w.priceUnit === 'm2' && w.pricePerM2
                      ? `${formatGEL(Number(w.pricePerM2))} ${ka.workers.perM2Slash}`
                      : w.pricePerUnit
                        ? `${formatGEL(Number(w.pricePerUnit))} ${ka.workers.perPieceSlash}`
                        : ka.workers.priceByAgreement}
                  </td>
                  <td className="px-4 py-3">
                    {Number(w.rating).toFixed(1)} ({w.reviewCount})
                  </td>
                  <td className="px-4 py-3">
                    {w.isActive ? (
                      <Badge variant="success">{ka.admin.badges.active}</Badge>
                    ) : (
                      <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/workers/${w.id}`}>
                        {ka.admin.actions.edit}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink-muted">
                    {ka.admin.workersEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
