'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Check,
  Loader2,
  MapPin,
  Phone,
  Printer,
  Save,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DesignSteps } from '@/components/design/DesignSteps';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { priceScene } from '@/lib/design/pricing';
import { formatGEL, formatM2 } from '@/lib/utils';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';

export default function DesignSummaryPage() {
  const t = useT();
  const { plan, styleId, mode, budgetGel, items, finishes, floorPlanUrl, homeState } = useDesignStore();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scene = useMemo(
    () => ({ styleId, mode, budgetGel, items, finishes }),
    [styleId, mode, budgetGel, items, finishes]
  );
  const cost = useMemo(() => (plan ? priceScene(plan, scene) : null), [plan, scene]);

  if (!plan || !cost) {
    return (
      <>
        <DesignSteps current={5} />
        <div className="container py-20 text-center">
          <h1 className="font-serif text-2xl font-bold">{t.design.needPlanTitle}</h1>
          <Button asChild className="mt-6">
            <Link href="/design">{t.design.startOver}</Link>
          </Button>
        </div>
      </>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/design/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameKa: `${t.design.title} — ${new Date().toLocaleDateString('ka-GE')}`,
          homeState: homeState ?? (mode === 'full' ? 'white_frame' : 'green_frame'),
          plan,
          scene,
          floorPlanUrl,
        }),
      });
      const json = (await res.json()) as {
        data: { id: number } | null;
        error: string | null;
      };
      if (json.error || !json.data) throw new Error(json.error ?? 'save-failed');
      setSavedId(json.data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const style = getStyle(styleId);

  return (
    <>
      <DesignSteps current={5} />
      <div className="container py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold md:text-3xl">{t.design.summaryTitle}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t.design.summarySubtitle}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1">
                {style.swatches.slice(0, 3).map((hex) => (
                  <span
                    key={hex}
                    className="h-3 w-3 rounded-full border border-line"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
              {plan.rooms.length} × {t.design.step2} · {formatM2(totalFloorAreaM2(plan))} ·{' '}
              {items.filter((i) => i.product).length} {t.design.itemsInRoom}
            </p>
          </div>

          <div className="flex gap-2 no-print">
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              {t.design.print}
            </Button>
            <Button type="button" onClick={save} disabled={saving || savedId != null}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedId != null ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving
                ? t.design.saving
                : savedId != null
                  ? t.design.savedTitle
                  : t.design.saveDesign}
            </Button>
          </div>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ---- baskets, grouped by partner ---- */}
          <div className="space-y-5">
            <h2 className="font-serif text-lg font-semibold">{t.design.byStore}</h2>

            {cost.baskets.map((basket, index) => (
              <Card key={basket.store?.id ?? `none-${index}`}>
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  {basket.store?.logoUrl && (
                    <Image
                      src={basket.store.logoUrl}
                      alt={basket.store.nameKa}
                      width={40}
                      height={40}
                      className="rounded-lg"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">
                      {basket.store?.nameKa ?? '—'}
                    </CardTitle>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                      {basket.store?.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {basket.store.address}
                        </span>
                      )}
                      {basket.store?.phone && (
                        <a
                          href={`tel:${basket.store.phone}`}
                          className="flex items-center gap-1 hover:text-brand"
                        >
                          <Phone className="h-3 w-3" />
                          {basket.store.phone}
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-serif text-lg font-bold text-brand-dark">
                      {formatGEL(basket.subtotal)}
                    </p>
                    <p className="flex items-center justify-end gap-1 text-[11px] text-ink-muted">
                      <Truck className="h-3 w-3" />
                      {basket.deliveryFee === 0
                        ? t.design.freeDelivery
                        : formatGEL(basket.deliveryFee)}
                    </p>
                  </div>
                </CardHeader>

                <CardContent>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-line">
                      {basket.lines.map((line, i) => (
                        <tr key={`${line.product.productId}-${i}`}>
                          <td className="py-2 pr-2">
                            <p className="font-medium text-ink">{line.product.nameKa}</p>
                            <p className="text-xs text-ink-muted">
                              {line.item} · {line.roomName}
                            </p>
                          </td>
                          <td className="whitespace-nowrap py-2 text-right text-xs text-ink-muted">
                            {line.product.qty !== 1 && `${line.product.qty} × `}
                            {formatGEL(line.product.pricePerUnit)}
                          </td>
                          <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold">
                            {formatGEL(line.product.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ---- totals ---- */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.design.grandTotal}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label={t.design.furnitureTotal} value={cost.furnitureTotal} />
                {mode !== 'full' && cost.finishesTotal > 0 && (
                  <Row label={t.design.finishesTotal} value={cost.finishesTotal} />
                )}
                {mode === 'full' && (
                  <>
                    <Row label={t.design.finishesTotal} value={cost.finishesTotal} />
                    <Row label={t.design.materialsTotal} value={cost.materialsTotal} />
                    <Row label={t.design.labourTotal} value={cost.labourTotal} />
                  </>
                )}
                <Row label={t.design.delivery} value={cost.deliveryTotal} />

                <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                  <span className="font-semibold">{t.design.grandTotal}</span>
                  <span className="font-serif text-2xl font-bold text-brand-dark">
                    {formatGEL(cost.grandTotal)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.design.perRoomTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {cost.perRoom.map((room) => (
                  <Row key={room.roomId} label={room.roomName} value={room.total} muted />
                ))}
              </CardContent>
            </Card>

            <Button asChild variant="outline" className="w-full no-print">
              <Link href="/design/studio">
                <ArrowLeft className="h-4 w-4" />
                {t.design.backToStudio}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'truncate text-ink-muted' : 'text-ink-muted'}>{label}</span>
      <span className={muted ? 'shrink-0 text-ink' : 'shrink-0 font-medium text-ink'}>
        {formatGEL(value)}
      </span>
    </div>
  );
}
