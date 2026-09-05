'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { SwapPanel } from '@/components/design/SwapPanel';
import { FinishPanel } from '@/components/design/FinishPanel';
import { StudioSidebar } from '@/components/design/StudioSidebar';
import { HoverCard, type HoverCardHandle } from '@/components/design/HoverCard';
import { useDesignStore } from '@/store/designStore';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useRateBook } from '@/hooks/useRateBook';
import { useT } from '@/lib/i18n/client';
import { priceScene } from '@/lib/design/pricing';
import { formatGEL } from '@/lib/utils';
import { rotateItem as rotatePlacement } from '@/lib/design/manipulate';
import type { PlacedItem, Vec2 } from '@/lib/design/types';
import type { ViewMode } from '@/components/design/Viewer3D';

/**
 * Three.js touches `window` at import time, so the viewport is client-only. The rest of the
 * studio (room list, cost bar, swap panel) renders server-side as normal.
 */
const Viewer3D = dynamic(() => import('@/components/design/Viewer3D').then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <ViewerFallback />,
});

type SurfaceSelection = { roomId: string; surface: 'floor' | 'wall' } | null;

export default function StudioPage() {
  const t = useT();
  const {
    plan,
    styleId,
    mode,
    homeState,
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
  const { book } = useRateBook();

  const [showWalls, setShowWalls] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('orbit');
  const [rotateBlocked, setRotateBlocked] = useState(false);
  /** A floor or wall clicked in the 3D view; the right panel then edits that room's finish. */
  const [selectedSurface, setSelectedSurface] = useState<SurfaceSelection>(null);
  const hoverCard = useRef<HoverCardHandle>(null);

  const scene = useMemo(
    () => ({ styleId, mode, budgetGel, items, finishes }),
    [styleId, mode, budgetGel, items, finishes]
  );

  const cost = useMemo(
    () =>
      plan
        ? priceScene(plan, scene, {
            homeState: homeState ?? undefined,
            book,
            surfaceLabels: {
              floor: t.design.finishFloor,
              wall: t.design.finishWall,
              ceiling: t.design.finishCeiling,
            },
          })
        : null,
    [plan, scene, homeState, book, t]
  );

  const selected = items.find((i) => i.id === selectedItemId) ?? null;

  // Stable handlers: the viewer keeps native listeners subscribed for the life of these.
  const onHoverItem = useCallback((item: PlacedItem | null, screen: { x: number; y: number } | null) => {
    if (item && screen) hoverCard.current?.show(item, screen);
    else hoverCard.current?.hide();
  }, []);
  const onSelectItem = useCallback(
    (id: string | null) => {
      selectItem(id);
      if (id) setSelectedSurface(null);
    },
    [selectItem]
  );
  const onSelectSurface = useCallback(
    (sel: SurfaceSelection) => {
      setSelectedSurface(sel);
      if (sel) selectItem(null);
    },
    [selectItem]
  );
  const onPlaceItem = useCallback(
    (itemId: string, position: Vec2, rotation: number, roomId: string) =>
      placeItem(itemId, position, rotation, roomId),
    [placeItem]
  );

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
          <StudioSidebar
            rooms={plan.rooms}
            focusRoomId={focusRoomId}
            itemsPerRoom={itemsPerRoom}
            totalItems={items.length}
            viewMode={viewMode}
            showWalls={showWalls}
            onFocusRoom={setFocusRoom}
            onViewMode={setViewMode}
            onToggleWalls={() => setShowWalls((v) => !v)}
            onRegenerate={() => generate(products)}
          />

          {/* ---- viewport ---- */}
          <div className="relative overflow-hidden rounded-lg border border-line bg-bg-surface shadow-card">
            <Viewer3D
              plan={plan}
              scene={scene}
              focusRoomId={focusRoomId}
              selectedItemId={selectedItemId}
              showWalls={showWalls}
              viewMode={viewMode}
              onHoverItem={onHoverItem}
              onSelectItem={onSelectItem}
              onSelectSurface={onSelectSurface}
              onPlaceItem={onPlaceItem}
              className="h-[560px] w-full"
            />

            <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-bg-surface/90 px-3 py-1 text-xs text-ink-muted shadow-sm backdrop-blur">
              {viewMode === 'walk' ? t.design.walkHint : t.design.dragHint}
            </p>

            {cost && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-bg-surface/95 px-4 py-2 shadow-cardHover backdrop-blur">
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">{t.design.furnitureTotal}</p>
                <p className="font-serif text-xl font-bold text-brand-dark">{formatGEL(cost.furnitureTotal)}</p>
              </div>
            )}

            <HoverCard ref={hoverCard} />
          </div>

          {/* ---- selected item / finishes ---- */}
          <aside className="flex h-[560px] flex-col gap-3">
            {selected ? (
              <SwapPanel
                item={selected}
                catalog={products}
                styleId={styleId}
                onSwap={(product) => swapProduct(selected.id, product)}
                onRotate={rotateSelected}
                rotateBlocked={rotateBlocked}
                onRemove={() => removeItem(selected.id)}
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
