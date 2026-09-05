'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, Eye, Loader2, Move3d, RefreshCw, SquareDashed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DesignSteps } from '@/components/design/DesignSteps';
import { ItemCard } from '@/components/design/ItemCard';
import { SwapPanel } from '@/components/design/SwapPanel';
import { FinishPanel } from '@/components/design/FinishPanel';
import { useDesignStore } from '@/store/designStore';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useT } from '@/lib/i18n/client';
import { priceScene } from '@/lib/design/pricing';
import { formatGEL, cn } from '@/lib/utils';
import { rotateItem as rotatePlacement } from '@/lib/design/manipulate';
import type { PlacedItem } from '@/lib/design/types';
import type { ViewMode } from '@/components/design/Viewer3D';

/**
 * Three.js touches `window` at import time, so the viewport is client-only. The rest of the
 * studio (room list, cost bar, swap panel) renders server-side as normal.
 */
const Viewer3D = dynamic(
  () => import('@/components/design/Viewer3D').then((m) => m.Viewer3D),
  {
    ssr: false,
    loading: () => <ViewerFallback />,
  }
);

export default function StudioPage() {
  const t = useT();
  const {
    plan,
    styleId,
    mode,
    budgetGel,
    items,
    finishes,
    focusRoomId,
    selectedItemId,
    setFocusRoom,
    selectItem,
    swapProduct,
    placeItem,
    removeItem,
    generate,
    setFinish,
  } = useDesignStore();
  const { products } = useDesignCatalog();

  const [showWalls, setShowWalls] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('orbit');
  const [rotateBlocked, setRotateBlocked] = useState(false);
  /** A floor or wall clicked in the 3D view; the right panel then edits that room's finish. */
  const [selectedSurface, setSelectedSurface] = useState<{ roomId: string; surface: 'floor' | 'wall' } | null>(null);
  const [hovered, setHovered] = useState<{
    item: PlacedItem;
    screen: { x: number; y: number };
  } | null>(null);

  const scene = useMemo(
    () => ({ styleId, mode, budgetGel, items, finishes }),
    [styleId, mode, budgetGel, items, finishes]
  );

  const cost = useMemo(
    () => (plan ? priceScene(plan, scene) : null),
    [plan, scene]
  );

  const selected = items.find((i) => i.id === selectedItemId) ?? null;

  /**
   * Rotating re-runs the same snapping a drag does, so a turn that would push the item into a
   * wall or its neighbour is refused rather than silently allowed.
   */
  const rotateSelected = useCallback(
    (steps: number) => {
      if (!selected || !plan) return;
      const room = plan.rooms.find((r) => r.id === selected.roomId);
      if (!room) return;

      const result = rotatePlacement(room, selected, steps, items);
      if (!result.valid) {
        setRotateBlocked(true);
        return;
      }
      setRotateBlocked(false);
      placeItem(selected.id, result.position, result.rotation, room.id);
    },
    [selected, plan, items, placeItem]
  );

  useEffect(() => setRotateBlocked(false), [selectedItemId]);

  // R rotates the selection, which is the shortcut every 3D tool uses.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (!selectedItemId) return;
      event.preventDefault();
      rotateSelected(event.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rotateSelected, selectedItemId]);

  const itemsPerRoom = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.roomId, (counts.get(item.roomId) ?? 0) + 1);
    return counts;
  }, [items]);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={4} />
        <div className="container py-20 text-center">
          <h1 className="font-serif text-2xl font-bold">{t.design.needPlanTitle}</h1>
          <p className="mt-2 text-ink-muted">{t.design.needPlanDesc}</p>
          <Button asChild className="mt-6">
            <Link href="/design">{t.design.startOver}</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DesignSteps current={4} />

      <div className="container py-6">
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
          {/* ---- rooms ---- */}
          <aside className="space-y-2">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {t.design.step2}
            </h2>
            <button
              type="button"
              onClick={() => setFocusRoom(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                focusRoomId === null ? 'bg-brand text-white' : 'hover:bg-bg-base'
              )}
            >
              {t.design.wholeFlat}
              <Badge variant={focusRoomId === null ? 'outline' : 'default'}>
                {items.length}
              </Badge>
            </button>

            {plan.rooms.map((room) => {
              const active = focusRoomId === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setFocusRoom(room.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    active ? 'bg-brand text-white' : 'hover:bg-bg-base'
                  )}
                >
                  <span className="truncate">{room.name}</span>
                  <Badge
                    variant={active ? 'outline' : 'default'}
                    className={active ? 'border-white/40 text-white' : undefined}
                  >
                    {itemsPerRoom.get(room.id) ?? 0}
                  </Badge>
                </button>
              );
            })}

            <div className="space-y-2 pt-3">
              <div className="flex rounded-md border border-line p-0.5">
                {(['orbit', 'walk'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={viewMode === mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                      viewMode === mode
                        ? 'bg-brand text-white'
                        : 'text-ink-muted hover:bg-bg-base'
                    )}
                  >
                    {mode === 'orbit' ? (
                      <Move3d className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {mode === 'orbit' ? t.design.orbitView : t.design.walkthrough}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant={showWalls ? 'outline' : 'default'}
                size="sm"
                className="w-full"
                aria-pressed={showWalls}
                disabled={viewMode === 'walk'}
                onClick={() => setShowWalls((v) => !v)}
              >
                <SquareDashed className="h-4 w-4" />
                {t.design.showWalls}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => generate(products)}
              >
                <RefreshCw className="h-4 w-4" />
                {t.design.regenerate}
              </Button>
            </div>
          </aside>

          {/* ---- viewport ---- */}
          <div className="relative overflow-hidden rounded-lg border border-line bg-bg-surface shadow-card">
            <Viewer3D
              plan={plan}
              scene={scene}
              focusRoomId={focusRoomId}
              selectedItemId={selectedItemId}
              showWalls={showWalls}
              viewMode={viewMode}
              onHoverItem={(item, screen) =>
                setHovered(item && screen ? { item, screen } : null)
              }
              onSelectItem={(id) => {
                selectItem(id);
                if (id) setSelectedSurface(null);
              }}
              onSelectSurface={(sel) => {
                setSelectedSurface(sel);
                if (sel) selectItem(null);
              }}
              onPlaceItem={placeItem}
              className="h-[560px] w-full"
            />

            <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-bg-surface/90 px-3 py-1 text-xs text-ink-muted shadow-sm backdrop-blur">
              {viewMode === 'walk' ? t.design.walkHint : t.design.dragHint}
            </p>

            {cost && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-bg-surface/95 px-4 py-2 shadow-cardHover backdrop-blur">
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                  {t.design.furnitureTotal}
                </p>
                <p className="font-serif text-xl font-bold text-brand-dark">
                  {formatGEL(cost.furnitureTotal)}
                </p>
              </div>
            )}

            {hovered && (
              <div
                className="pointer-events-none fixed z-50"
                style={{
                  left: Math.min(hovered.screen.x + 16, window.innerWidth - 300),
                  top: Math.min(hovered.screen.y + 16, window.innerHeight - 260),
                }}
              >
                <ItemCard item={hovered.item} />
              </div>
            )}
          </div>

          {/* ---- selected item ---- */}
          <aside className="flex h-[560px] flex-col gap-3">
            {selected ? (
              <SwapPanel
                item={selected}
                catalog={products}
                styleId={styleId}
                onSwap={(product) => selected && swapProduct(selected.id, product)}
                onRotate={rotateSelected}
                rotateBlocked={rotateBlocked}
                onRemove={() => selected && removeItem(selected.id)}
              />
            ) : (
              <FinishPanel
                roomId={selectedSurface?.roomId ?? focusRoomId}
                surface={selectedSurface?.surface ?? null}
                rooms={plan.rooms}
                catalog={products}
                styleId={styleId}
                finishes={finishes}
                onPick={(surface, product) =>
                  setFinish(
                    selectedSurface
                      ? [selectedSurface.roomId]
                      : focusRoomId
                        ? [focusRoomId]
                        : plan.rooms.map((r) => r.id),
                    surface,
                    product
                  )
                }
              />
            )}
            <Button asChild size="lg" className="w-full">
              <Link href="/design/summary">
                {t.design.goToSummary}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </aside>
        </div>
      </div>
    </>
  );
}

function ViewerFallback() {
  return (
    <div className="grid h-[560px] w-full place-items-center bg-bg-base">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
        <p className="text-sm">…</p>
      </div>
    </div>
  );
}
