'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DesignSteps } from '@/components/design/DesignSteps';
import { SwapPanel } from '@/components/design/SwapPanel';
import { FinishPanel } from '@/components/design/FinishPanel';
import { HoverCard, type HoverCardHandle } from '@/components/design/HoverCard';
import { StudioRail, type RailTab } from '@/components/design/StudioRail';
import { FloatingPanel } from '@/components/design/FloatingPanel';
import { AddFurniturePanel, FURNITURE_DRAG_TYPE } from '@/components/design/AddFurniturePanel';
import { OpeningsPanel } from '@/components/design/OpeningsPanel';
import { PhotoDialog, type StudioShot } from '@/components/design/PhotoDialog';
import { ViewSwitch, ZoomControls, type StudioView } from '@/components/design/StudioControls';
import { PlanCanvas } from '@/components/design/PlanCanvas';
import { useDesignStore } from '@/store/designStore';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useRateBook } from '@/hooks/useRateBook';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { priceScene } from '@/lib/design/pricing';
import { archetypeLabel } from '@/lib/design/catalog';
import { saveDesign } from '@/lib/design/saveDesign';
import { DAYLIGHT_HOURS, type DaylightPreset } from '@/lib/design3d/daylight';
import { formatGEL, cn } from '@/lib/utils';
import { ROTATE_STEP_RAD, rotateItem as rotatePlacement } from '@/lib/design/manipulate';
import { tightSpotsByItem, type TightSpot } from '@/lib/design/clearance';
import { fill } from '@/lib/admin/list';
import type { PlacedItem, Vec2 } from '@/lib/design/types';
import type { ViewerApi } from '@/components/design/Viewer3D';

/**
 * Three.js touches `window` at import time, so the viewport is client-only. Everything else
 * — rail, panels, cost bar — renders server-side as normal.
 */
const Viewer3D = dynamic(() => import('@/components/design/Viewer3D').then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <ViewerFallback />,
});

type SurfaceSelection = { roomId: string; surface: 'floor' | 'wall' } | null;

/**
 * The studio: a full-bleed canvas with everything else floating over it. A left rail opens
 * one panel at a time (rooms, doors & windows, furniture, finishes, cost) — each opens on
 * the whole flat with the rooms listed by name and narrows to one room when one is picked;
 * selecting a piece opens its card on the right; the view switch, the time of day and the
 * camera sit top-centre, zoom bottom-right, the running total bottom-left. Furniture can be
 * dragged from the catalogue list straight into the 3D view.
 */
export default function StudioPage() {
  const t = useT();
  const locale = useLocale();
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
    carryingItemId,
    setFocusRoom,
    selectItem,
    swapProduct,
    placeItem,
    removeItem,
    generate,
    setFinish,
    addItem,
    beginAdd,
    finishCarry,
    cancelCarry,
    pendingPicks,
    applyPendingPicks,
    addOpening,
    moveOpening,
    moveOpeningToWall,
    updateOpening,
    setOpeningWall,
    removeOpening,
    saveState,
  } = useDesignStore();
  const { products } = useDesignCatalog();

  // Calculator picks that arrived for an existing design go into it once the catalogue is here.
  useEffect(() => {
    if (pendingPicks && products.length > 0) applyPendingPicks(products);
  }, [pendingPicks, products, applyPendingPicks]);
  const { book } = useRateBook();

  const [view, setView] = useState<StudioView>('3d');
  const [showWalls, setShowWalls] = useState(true);
  const [daylight, setDaylight] = useState<DaylightPreset>('noon');
  const [rail, setRail] = useState<RailTab | null>('rooms');
  const [rotateBlocked, setRotateBlocked] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState<SurfaceSelection>(null);
  /** The "items" panel flips between the room's list and the catalogue browser. */
  const [adding, setAdding] = useState(false);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [shot, setShot] = useState<StudioShot | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const hoverCard = useRef<HoverCardHandle>(null);
  const [viewerApi, setViewerApi] = useState<ViewerApi | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** A product dropped from the list: where it landed, applied once the viewer is carrying it. */
  const pendingDrop = useRef<{ x: number; y: number } | null>(null);

  // The workspace itself goes full screen (not the page), so the header and step strip drop
  // away and the canvas gets every pixel; the floating chrome stays with it.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === workspaceRef.current && !!workspaceRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void workspaceRef.current?.requestFullscreen?.();
  }, []);

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
            locale,
            surfaceLabels: { floor: t.design.finishFloor, wall: t.design.finishWall, ceiling: t.design.finishCeiling },
          })
        : null,
    [plan, scene, homeState, book, t, locale]
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
      if (sel) {
        selectItem(null);
        setRail('finishes');
      }
    },
    [selectItem]
  );
  const onPlaceItem = useCallback(
    (itemId: string, position: Vec2, rotation: number, roomId: string) => placeItem(itemId, position, rotation, roomId),
    [placeItem]
  );
  const onApi = useCallback((api: ViewerApi | null) => setViewerApi(api), []);
  const onCarryPlaced = useCallback(
    (itemId: string) => {
      finishCarry();
      selectItem(itemId);
    },
    [finishCarry, selectItem]
  );

  // A product dropped from the list is carried by the viewer from the next render; set it
  // down where it was dropped as soon as that is so.
  useEffect(() => {
    const drop = pendingDrop.current;
    if (!carryingItemId || !drop || !viewerApi) return;
    pendingDrop.current = null;
    viewerApi.dropCarriedAt(drop.x, drop.y);
  }, [carryingItemId, viewerApi]);

  const rotateSelected = useCallback(
    (steps: number) => {
      if (!selected || !plan) return;
      if (carryingItemId && selected.id === carryingItemId) {
        // On the pointer the angle is all that matters; the spot comes from the viewer.
        const pose = viewerApi?.carryPose();
        placeItem(selected.id, pose?.position ?? selected.position, selected.rotation + steps * ROTATE_STEP_RAD, pose?.roomId ?? selected.roomId);
        setRotateBlocked(false);
        return;
      }
      const room = plan.rooms.find((r) => r.id === selected.roomId);
      if (!room) return;
      const result = rotatePlacement(room, selected, steps, items);
      // The turn always happens; a pose that collides is shown in red until it is dragged
      // somewhere it fits, and the hint below the item says so.
      setRotateBlocked(!result.valid);
      placeItem(selected.id, result.position, result.rotation, room.id);
    },
    [selected, plan, items, placeItem, carryingItemId, viewerApi]
  );

  useEffect(() => setRotateBlocked(false), [selectedItemId]);

  // R rotates the selection, Escape clears it, 1/2/3 switch the view. WASD and the arrows
  // pan the 3D view and are handled by the viewer itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      // Physical keys (`event.code`), so R is R on a Georgian layout too.
      const code = event.code;
      if (code === 'Escape') {
        // Escape while carrying takes the piece back out of the room.
        if (carryingItemId) cancelCarry();
        else selectItem(null);
        setSelectedSurface(null);
      } else if (code === 'KeyR' && selectedItemId) {
        event.preventDefault();
        rotateSelected(event.shiftKey ? -1 : 1);
      } else if (code === 'Digit1') setView('2d');
      else if (code === 'Digit2') setView('3d');
      else if (code === 'Digit3') setView('walk');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rotateSelected, selectedItemId, selectItem, carryingItemId, cancelCarry]);

  const itemsPerRoom = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.roomId, (counts.get(item.roomId) ?? 0) + 1);
    return counts;
  }, [items]);

  /** Saves the design as it stands (a draft is enough) and returns the project id. */
  const ensureSaved = useCallback(() => saveDesign({ draft: true, nameKa: `${t.design.title} — ${new Date().toLocaleDateString('ka-GE')}` }), [t.design.title]);

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

  const focusRoom = plan.rooms.find((r) => r.id === focusRoomId) ?? null;
  const visibleItems = focusRoom ? items.filter((i) => i.roomId === focusRoom.id) : items;
  // Cheap enough per render (a few dozen boxes), and this line sits below an early return.
  const tightSpots: Map<string, TightSpot> = plan ? tightSpotsByItem(plan.rooms, items) : new Map();
  const roomNameOf = (id: string) => plan.rooms.find((r) => r.id === id)?.name ?? '';
  /** The whole flat's furniture grouped by room, in plan order, for the list. */
  const itemGroups = focusRoom ? [{ room: focusRoom, items: visibleItems }] : plan.rooms.map((room) => ({ room, items: items.filter((i) => i.roomId === room.id) })).filter((g) => g.items.length > 0);

  /** A product dragged from the catalogue list and let go over the canvas. */
  const onDrop = (event: React.DragEvent) => {
    const raw = event.dataTransfer.getData(FURNITURE_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();
    const product = products.find((p) => p.id === Number(raw));
    if (!product) return;
    if (view === '2d' || !viewerApi) {
      // No 3D pointer to land on: put it somewhere sensible in the focused (or largest) room.
      const largest = [...plan.rooms].sort((a, b) => b.areaM2 - a.areaM2)[0];
      addItem(product, focusRoomId ?? largest.id);
      return;
    }
    const at = viewerApi.floorPointAt(event.clientX, event.clientY);
    const roomId = at?.roomId ?? focusRoomId ?? null;
    pendingDrop.current = { x: event.clientX, y: event.clientY };
    if (beginAdd(product, roomId) === null) pendingDrop.current = null;
  };

  const takePhoto = () => {
    if (!viewerApi) return;
    const dataUrl = viewerApi.screenshot();
    if (!dataUrl) return;
    setShot({ dataUrl, roomName: focusRoom?.name ?? null, camera: viewerApi.cameraPose() });
    setPhotoOpen(true);
  };

  return (
    <>
      <DesignSteps current={4} />

      <div
        ref={workspaceRef}
        className={cn('relative w-full overflow-hidden bg-sand-light', fullscreen ? 'h-screen' : 'h-[calc(100vh-72px-48px)] min-h-[560px]')}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(FURNITURE_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={onDrop}
      >
        {/* ---- canvas ---- */}
        <div className="absolute inset-0">
          {view === '2d' ? (
            <div className={cn('grid h-full w-full place-items-center px-6 pb-16 pt-20 transition-[padding] duration-300', rail && 'lg:pl-[26rem]', selected && 'lg:pr-[24rem]')}>
              <div className="glass h-full w-full max-w-5xl overflow-hidden rounded-3xl bg-white/80">
                <PlanCanvas
                  plan={plan}
                  selectedRoomId={focusRoomId}
                  onSelectRoom={(id) => setFocusRoom(id)}
                  selectedOpeningId={rail === 'openings' ? selectedOpeningId : null}
                  onSelectOpening={rail === 'openings' ? (_roomId, id) => setSelectedOpeningId(id) : undefined}
                  onMoveOpening={rail === 'openings' ? moveOpening : undefined}
                  onMoveOpeningToWall={rail === 'openings' ? moveOpeningToWall : undefined}
                  className="block h-full w-full cursor-pointer"
                />
              </div>
            </div>
          ) : (
            <Viewer3D
              plan={plan}
              scene={scene}
              focusRoomId={focusRoomId}
              selectedItemId={selectedItemId}
              showWalls={showWalls}
              viewMode={view === 'walk' ? 'walk' : 'orbit'}
              editMode={rail === 'openings' ? 'openings' : 'furniture'}
              daylightHour={DAYLIGHT_HOURS[daylight]}
              selectedOpeningId={selectedOpeningId}
              onMoveOpening={moveOpening}
              onSelectOpening={setSelectedOpeningId}
              onHoverItem={onHoverItem}
              onSelectItem={onSelectItem}
              onSelectSurface={onSelectSurface}
              onPlaceItem={onPlaceItem}
              carryingItemId={carryingItemId}
              onCarryPlaced={onCarryPlaced}
              onApi={onApi}
              className="h-full w-full"
            />
          )}
        </div>

        {/* ---- top bar ---- */}
        <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-4">
          <div className="pointer-events-auto glass flex items-center gap-2 py-1.5 pl-4 pr-2">
            <span className="text-sm font-medium">{focusRoom ? focusRoom.name : t.design.wholeFlat}</span>
            <Badge variant="outline">{visibleItems.length}</Badge>
            {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-label={t.design.saving} />}
            {saveState === 'saved' && (
              <span className="flex items-center gap-1 text-[11px] text-ink-muted" title={t.design.autosaved}>
                <Check className="h-3 w-3 text-success" />
                {t.design.autosaved}
              </span>
            )}
          </div>
          <div className="pointer-events-auto">
            <ViewSwitch
              view={view}
              onView={setView}
              showWalls={showWalls}
              onToggleWalls={() => setShowWalls((v) => !v)}
              onRegenerate={() => generate(products)}
              daylight={daylight}
              onDaylight={setDaylight}
              onPhoto={view !== '2d' && viewerApi ? takePhoto : undefined}
            />
          </div>
          <Link
            href="/design/summary"
            className="pointer-events-auto group inline-flex h-11 items-center gap-2 bg-ink pl-5 pr-4 text-sm font-medium text-white shadow-float transition-colors hover:bg-brand"
          >
            {t.design.goToSummary}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* ---- left rail + panel ---- */}
        {/* Every panel opens on the whole flat; picking a room in one focuses it in 3D too. */}
        <div className="pointer-events-none absolute bottom-20 left-4 top-20 flex items-start gap-3">
          <div className="pointer-events-auto">
            <StudioRail active={rail} onChange={setRail} />
          </div>
          {rail && (
            <div className="pointer-events-auto flex max-h-full w-[320px] flex-col">
              {rail === 'rooms' && (
                <FloatingPanel title={t.design.step2} subtitle={`${plan.rooms.length} · ${items.length}`} onClose={() => setRail(null)}>
                  <ul className="space-y-1">
                    <RoomRow label={t.design.wholeFlat} count={items.length} active={focusRoomId === null} onClick={() => setFocusRoom(null)} />
                    {plan.rooms.map((room) => (
                      <RoomRow
                        key={room.id}
                        label={room.name}
                        count={itemsPerRoom.get(room.id) ?? 0}
                        active={focusRoomId === room.id}
                        onClick={() => setFocusRoom(room.id)}
                      />
                    ))}
                  </ul>
                </FloatingPanel>
              )}
              {rail === 'openings' && (
                <FloatingPanel title={t.design.openingsTitle} subtitle={focusRoom?.name ?? t.design.wholeFlat} onClose={() => setRail(null)} className="h-full">
                  <OpeningsPanel
                    rooms={plan.rooms}
                    roomId={focusRoomId}
                    selectedId={selectedOpeningId}
                    onRoom={(id) => {
                      setFocusRoom(id);
                      setSelectedOpeningId(null);
                    }}
                    onSelect={setSelectedOpeningId}
                    onAdd={(roomId, kind) => {
                      const id = addOpening(roomId, kind);
                      if (id) setSelectedOpeningId(id);
                      return !!id;
                    }}
                    onMove={moveOpening}
                    onUpdate={updateOpening}
                    onWall={setOpeningWall}
                    onRemove={(roomId, id) => {
                      removeOpening(roomId, id);
                      if (selectedOpeningId === id) setSelectedOpeningId(null);
                    }}
                  />
                </FloatingPanel>
              )}
              {rail === 'items' && adding && (
                <FloatingPanel title={t.design.addFurniture} subtitle={focusRoom?.name ?? t.design.wholeFlat} onClose={() => setRail(null)} className="h-full">
                  <AddFurniturePanel
                    catalog={products}
                    rooms={plan.rooms}
                    roomId={focusRoomId}
                    styleId={styleId}
                    onRoom={setFocusRoom}
                    onAdd={(product) => beginAdd(product, focusRoomId) !== null}
                    onBack={() => setAdding(false)}
                  />
                </FloatingPanel>
              )}
              {rail === 'items' && !adding && (
                <FloatingPanel title={t.design.furnitureTitle} subtitle={focusRoom?.name ?? t.design.wholeFlat} onClose={() => setRail(null)}>
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="mb-3 flex w-full items-center justify-center gap-2 border border-ink bg-ink py-2 text-sm font-medium text-white transition-colors hover:border-brand hover:bg-brand"
                  >
                    <Plus className="h-4 w-4" />
                    {t.design.addFurniture}
                  </button>
                  {visibleItems.some((i) => tightSpots.has(i.id)) && <p className="mb-2 text-[11px] text-warning">{t.design.tightPassageHint}</p>}
                  {visibleItems.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-muted">{t.design.emptyRoom}</p>
                  ) : (
                    <div className="space-y-3">
                      {itemGroups.map((group) => (
                        <div key={group.room.id}>
                          {!focusRoom && (
                            <button type="button" onClick={() => setFocusRoom(group.room.id)} className="mb-1 flex w-full items-baseline justify-between border-b border-line pb-1 text-left">
                              <span className="font-serif text-sm font-semibold text-ink">{group.room.name}</span>
                              <span className="text-[11px] tabular-nums text-ink-muted">{group.items.length}</span>
                            </button>
                          )}
                          <ul className="space-y-1">
                            {group.items.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => onSelectItem(item.id)}
                                  className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                                    selectedItemId === item.id ? 'bg-ink text-white' : 'hover:bg-white'
                                  )}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium">{item.product ? localizedName(locale, item.product) : '—'}</span>
                                    <span className={cn('block truncate text-xs', selectedItemId === item.id ? 'text-white/70' : 'text-ink-muted')}>
                                      {archetypeLabel(item.kind, locale)}
                                    </span>
                                    {tightSpots.has(item.id) && (
                                      <span className={cn('mt-0.5 flex items-center gap-1 text-[11px] font-medium', selectedItemId === item.id ? 'text-amber-300' : 'text-warning')}>
                                        <AlertTriangle className="h-3 w-3" />
                                        {fill(t.design.tightPassage, { n: Math.round(tightSpots.get(item.id)!.gapM * 100) })}
                                      </span>
                                    )}
                                  </span>
                                  {item.product && <span className="shrink-0 text-xs tabular-nums">{formatGEL(item.product.totalPrice)}</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </FloatingPanel>
              )}
              {rail === 'finishes' && (
                <FloatingPanel title={t.design.finishesTitle} subtitle={selectedSurface ? roomNameOf(selectedSurface.roomId) : focusRoom?.name ?? t.design.finishForAllRooms} onClose={() => setRail(null)} className="h-full">
                  <FinishPanel
                    roomId={selectedSurface?.roomId ?? focusRoomId}
                    surface={selectedSurface?.surface ?? null}
                    rooms={plan.rooms}
                    catalog={products}
                    styleId={styleId}
                    finishes={finishes}
                    onRoom={(id) => {
                      setSelectedSurface(null);
                      setFocusRoom(id);
                    }}
                    onPick={(surface, product) =>
                      setFinish(
                        selectedSurface ? [selectedSurface.roomId] : focusRoomId ? [focusRoomId] : plan.rooms.map((r) => r.id),
                        surface,
                        product
                      )
                    }
                  />
                </FloatingPanel>
              )}
              {rail === 'cost' && cost && (
                <FloatingPanel title={t.design.furnitureTotal} subtitle={formatGEL(cost.grandTotal)} onClose={() => setRail(null)}>
                  <ul className="divide-y divide-line/70 text-sm">
                    {cost.perRoom.map((room) => (
                      <li key={room.roomId} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="truncate text-ink-soft">{room.roomName}</span>
                        <span className="shrink-0 tabular-nums font-medium">{formatGEL(room.total)}</span>
                      </li>
                    ))}
                    {cost.deliveryTotal > 0 && (
                      <li className="flex items-baseline justify-between gap-3 py-2 text-ink-muted">
                        <span>{t.design.delivery}</span>
                        <span className="tabular-nums">{formatGEL(cost.deliveryTotal)}</span>
                      </li>
                    )}
                  </ul>
                  <Button asChild variant="ink" className="mt-4 w-full">
                    <Link href="/design/summary">
                      {t.design.goToSummary} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </FloatingPanel>
              )}
            </div>
          )}
        </div>

        {/* ---- selected item card (right) ---- */}
        {selected && view !== '2d' && rail !== 'openings' && (
          <div className="pointer-events-auto absolute bottom-4 right-4 top-20 flex w-[340px] flex-col">
            <FloatingPanel title={t.design.selectedItem} subtitle={archetypeLabel(selected.kind, locale)} onClose={() => selectItem(null)} className="h-full">
              <SwapPanel
                key={selected.id}
                item={selected}
                catalog={products}
                styleId={styleId}
                onSwap={(product) => swapProduct(selected.id, product)}
                onRotate={rotateSelected}
                rotateBlocked={rotateBlocked}
                onRemove={() => removeItem(selected.id)}
              />
            </FloatingPanel>
          </div>
        )}

        {/* ---- bottom overlays ---- */}
        {cost && (
          <div className="pointer-events-auto glass absolute bottom-4 left-4 flex items-center gap-4 rounded-2xl px-5 py-3">
            <div>
              <p className="eyebrow">{t.design.furnitureTotal}</p>
              <p className="font-serif text-2xl font-bold leading-tight text-ink">{formatGEL(cost.furnitureTotal)}</p>
            </div>
            {cost.finishesTotal > 0 && (
              <div className="border-l border-line pl-4">
                <p className="eyebrow">{t.design.finishesTotal}</p>
                <p className="font-serif text-xl font-semibold leading-tight text-ink">{formatGEL(cost.finishesTotal)}</p>
              </div>
            )}
          </div>
        )}
        <p className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 bg-ink/70 px-3 py-1 text-xs text-white backdrop-blur md:block">
          {carryingItemId ? t.design.carryHint : view === 'walk' ? t.design.walkHint : view === '2d' ? t.design.reviewSubtitle : rail === 'openings' ? t.design.openingsHint : t.design.dragHint}
        </p>
        {/* Steps left when the item panel is open so the two never overlap. */}
        <div className={cn('pointer-events-auto absolute bottom-4 transition-[right] duration-300', selected && view !== '2d' ? 'right-[calc(340px+2rem)]' : 'right-4')}>
          <ZoomControls
            onZoom={(f) => viewerApi?.zoom(f)}
            onReset={() => viewerApi?.reset()}
            onFullscreen={toggleFullscreen}
            fullscreen={fullscreen}
            disabled={view !== '3d' || !viewerApi}
          />
        </div>

        <HoverCard ref={hoverCard} />
      </div>

      <PhotoDialog shot={shot} open={photoOpen} onOpenChange={setPhotoOpen} ensureSaved={ensureSaved} />
    </>
  );
}

function RoomRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
          active ? 'bg-ink text-white' : 'hover:bg-white'
        )}
      >
        <span className="truncate">{label}</span>
        <span className={cn('shrink-0 px-2 py-0.5 text-xs tabular-nums', active ? 'bg-white/15' : 'bg-bg-base text-ink-muted')}>{count}</span>
      </button>
    </li>
  );
}

function ViewerFallback() {
  return (
    <div className="grid h-full w-full place-items-center bg-sand-light">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    </div>
  );
}
