'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { SwapPanel } from '@/components/design/SwapPanel';
import { FinishPanel } from '@/components/design/FinishPanel';
import { HoverCard, type HoverCardHandle } from '@/components/design/HoverCard';
import { FloatingPanel } from '@/components/design/FloatingPanel';
import { PhotoDialog, type StudioShot } from '@/components/design/PhotoDialog';
import { ZoomControls, type StudioView } from '@/components/design/StudioControls';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { ElementInspector } from '@/components/plan/ElementInspector';
import { CategoryRail, Tray, type StudioCategory } from '@/components/studio/BuildBar';
import { FurnitureTray, FURNITURE_DRAG_TYPE } from '@/components/studio/FurnitureTray';
import { BuildTray, BudgetTray, ElectricTray, ELECTRICAL_DRAG_TYPE, FinishesTray, type FinishScope, type FinishSurface } from '@/components/studio/Trays';
import { StudioTopBar } from '@/components/studio/StudioTopBar';
import { TutorialOverlay, tutorialSeen } from '@/components/studio/TutorialOverlay';
import { NavHelp } from '@/components/studio/NavHelp';
import { VersionsPanel } from '@/components/studio/VersionsPanel';
import { FixturePanel } from '@/components/studio/FixturePanel';
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
import { halfZone, isBaseFinish, wallEdgeAreaM2 } from '@/lib/design/zones';
import { surfaceOptions } from '@/lib/design/surfaces';
import { formatM2 } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import type { EditorTool } from '@/components/plan/PlanEditor';
import type { ElectricalKind, PlacedItem, Vec2 } from '@/lib/design/types';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { ViewerApi, EditMode } from '@/components/design/Viewer3D';

/**
 * Three.js touches `window` at import time, so the viewport is client-only. Everything else
 * — the bars, the trays, the panels — renders server-side as normal.
 */
const Viewer3D = dynamic(() => import('@/components/design/Viewer3D').then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <ViewerFallback />,
});

type SurfaceSelection = { roomId: string; surface: 'floor' | 'wall'; wallIndex?: number } | null;

const CATEGORY_MODE: Record<StudioCategory, EditMode> = { build: 'build', furniture: 'furniture', electric: 'electrical', finishes: 'finishes', budget: 'furniture' };
const CATEGORY_TOOLS: Record<StudioCategory, EditorTool[]> = {
  build: ['select', 'pan', 'wall', 'room', 'door', 'window', 'column', 'beam'],
  furniture: ['select', 'pan'],
  electric: ['select', 'pan', 'electrical'],
  finishes: ['select', 'pan', 'zone'],
  budget: ['select', 'pan'],
};

/**
 * The studio — steps 5 and 6 of the journey, one canvas. A full-bleed 3D (or 2D, or
 * walk-through) view with everything else floating over it, the way a game's build mode
 * works: a rail of categories down the left (build · furniture · electric & light ·
 * finishes · budget) above the rooms, a tray along the bottom with the open category's tools
 * or its shelf of products; the selected thing's card sits on the right; the top bar holds
 * the view, undo/redo, the structure lock, the kept versions and the way on. A product or a
 * fitting dragged from a tray rides on the pointer in the 3D view from the moment the drag
 * starts. Whatever opens on the right (the item card, the inspector, the versions) is an
 * overlay on the canvas: nothing else moves for it. Finishes are picked from the tray of
 * the finishes category, and only there does a click on a floor or a wall choose the
 * surface. Walls, doors and windows start locked; unlocking them lets the person drag walls
 * in 3D (or draw new ones in 2D). Every change is undoable and the existing house is kept
 * as version 01.
 */
export default function StudioPage() {
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const store = useDesignStore();
  const {
    plan,
    styleId,
    mode,
    homeState,
    budgetGel,
    items,
    finishes,
    electrical,
    styleProfile,
    focusRoomId,
    selectedItemId,
    selectedElement,
    carryingItemId,
    structureLocked,
    history,
    saveState,
    pendingPicks,
  } = store;
  const { products } = useDesignCatalog();
  const { book } = useRateBook();

  // Calculator picks that arrived for an existing design go into it once the catalogue is here.
  useEffect(() => {
    if (pendingPicks && products.length > 0) store.applyPendingPicks(products);
  }, [pendingPicks, products, store]);

  // The existing house is kept the first time the studio opens on a plan.
  useEffect(() => {
    if (plan && plan.rooms.length > 0) store.ensureExistingVersion(t.build.versionExisting);
    // Once per plan identity is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.rooms.length]);

  const [view, setView] = useState<StudioView>('3d');
  const [category, setCategory] = useState<StudioCategory>(() => (searchParams.get('tool') === 'finishes' ? 'finishes' : 'furniture'));
  const [trayOpen, setTrayOpen] = useState(true);
  const [buildTool, setBuildTool] = useState<EditorTool>('select');
  const [thicknessM, setThicknessM] = useState(plan?.wallThicknessM ?? 0.12);
  const [electricalKind, setElectricalKind] = useState<ElectricalKind>('socket');
  const [electricalArmed, setElectricalArmed] = useState(false);
  const [finishScope, setFinishScope] = useState<FinishScope>('room');
  const [finishSurface, setFinishSurface] = useState<FinishSurface>('floor');
  const [showWalls, setShowWalls] = useState(true);
  const [daylight, setDaylight] = useState<DaylightPreset>('noon');
  const [rotateBlocked, setRotateBlocked] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState<SurfaceSelection>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [shot, setShot] = useState<StudioShot | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [refused, setRefused] = useState(false);
  const hoverCard = useRef<HoverCardHandle>(null);
  const [viewerApi, setViewerApi] = useState<ViewerApi | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceEl, setWorkspaceEl] = useState<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** What is being dragged from a tray right now, so the view can show it under the pointer. */
  const [draggingKind, setDraggingKind] = useState<ElectricalKind | null>(null);
  /** The category, readable from the viewer's long-lived callbacks. */
  const categoryRef = useRef(category);
  useEffect(() => {
    categoryRef.current = category;
  }, [category]);
  /** The dragged product has been put on the pointer in 3D (a carry the drop or the drag's end resolves). */
  const dragCarry = useRef(false);
  /** A product dropped before the viewer carried it: where it landed, applied once it does. */
  const pendingDrop = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (searchParams.get('tool') === 'finishes') {
      setCategory('finishes');
      store.setStep(6);
    } else store.setStep(5);
    // Only the query parameter matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // The tour, once, when the studio is first seen.
  useEffect(() => {
    if (plan && !tutorialSeen()) setTourOpen(true);
    // On mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!refused) return;
    const handle = window.setTimeout(() => setRefused(false), 2200);
    return () => window.clearTimeout(handle);
  }, [refused]);

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
  const setWorkspace = useCallback((el: HTMLDivElement | null) => {
    workspaceRef.current = el;
    setWorkspaceEl(el);
  }, []);

  const scene = useMemo(() => ({ styleId, mode, budgetGel, items, finishes, electrical, styleProfile }), [styleId, mode, budgetGel, items, finishes, electrical, styleProfile]);

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
  const editMode: EditMode = CATEGORY_MODE[category];

  // Stable handlers: the viewer keeps native listeners subscribed for the life of these.
  const onHoverItem = useCallback((item: PlacedItem | null, screen: { x: number; y: number } | null) => {
    if (item && screen) hoverCard.current?.show(item, screen);
    else hoverCard.current?.hide();
  }, []);
  const onSelectItem = useCallback(
    (id: string | null) => {
      store.selectItem(id);
      if (id) setSelectedSurface(null);
    },
    [store]
  );
  // A tap on a floor or a wall chooses the surface the finishes tray applies to — in the
  // finishes category only. Elsewhere the floor and the walls are just the room.
  const onSelectSurface = useCallback(
    (sel: SurfaceSelection) => {
      if (categoryRef.current !== 'finishes') return;
      setSelectedSurface(sel);
      if (sel) {
        store.selectItem(null);
        store.selectElement(null);
        setFinishSurface(sel.surface);
        setFinishScope(sel.surface === 'wall' && sel.wallIndex != null ? 'wall' : 'room');
        setTrayOpen(true);
      }
    },
    [store]
  );
  const onPlaceItem = useCallback((itemId: string, position: Vec2, rotation: number, roomId: string) => store.placeItem(itemId, position, rotation, roomId), [store]);
  const onApi = useCallback((api: ViewerApi | null) => setViewerApi(api), []);
  const onCarryPlaced = useCallback(
    (itemId: string) => {
      store.finishCarry();
      store.selectItem(itemId);
    },
    [store]
  );
  const onSelectElement = useCallback((sel: Parameters<typeof store.selectElement>[0]) => store.selectElement(sel), [store]);
  const onOffsetWall = useCallback((wallId: string, distance: number) => store.offsetWall(wallId, distance), [store]);
  const onMoveColumn = useCallback((id: string, position: Vec2) => store.updateColumn(id, { position }), [store]);
  const onMoveElectrical = useCallback((id: string, position: Vec2) => store.moveElectricalPoint(id, position), [store]);
  const onMoveOpening = useCallback((roomId: string, openingId: string, tt: number) => store.moveOpening(roomId, openingId, tt), [store]);
  const onSelectOpening = useCallback((id: string | null) => {
    if (!id) store.selectElement(null);
  }, [store]);

  // A product dropped before the viewer carried it is set down where it was dropped as soon
  // as the carry exists.
  useEffect(() => {
    const drop = pendingDrop.current;
    if (!carryingItemId || !drop || !viewerApi) return;
    pendingDrop.current = null;
    viewerApi.dropCarriedAt(drop.x, drop.y);
  }, [carryingItemId, viewerApi]);

  const rotateSelected = useCallback(
    (steps: number) => {
      if (!selected || !plan || selected.locked) return;
      if (carryingItemId && selected.id === carryingItemId) {
        const pose = viewerApi?.carryPose();
        store.placeItem(selected.id, pose?.position ?? selected.position, selected.rotation + steps * ROTATE_STEP_RAD, pose?.roomId ?? selected.roomId);
        setRotateBlocked(false);
        return;
      }
      const room = plan.rooms.find((r) => r.id === selected.roomId);
      if (!room) return;
      const result = rotatePlacement(room, selected, steps, items);
      setRotateBlocked(!result.valid);
      store.placeItem(selected.id, result.position, result.rotation, room.id);
    },
    [selected, plan, items, store, carryingItemId, viewerApi]
  );

  useEffect(() => setRotateBlocked(false), [selectedItemId]);

  // Keys: R turns, M mirrors, Ctrl+Z/Y undo and redo, Ctrl+C/V copy and paste, Ctrl+D
  // duplicates, Delete removes, Escape clears, 1/2/3 switch the view. The 2D board handles
  // Delete and Escape itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)) return;
      const code = event.code;
      if (event.metaKey || event.ctrlKey) {
        if (code === 'KeyZ' && !event.shiftKey) {
          event.preventDefault();
          store.undo();
        } else if (code === 'KeyY' || (code === 'KeyZ' && event.shiftKey)) {
          event.preventDefault();
          store.redo();
        } else if (code === 'KeyC' && selectedItemId) {
          event.preventDefault();
          store.copyItem(selectedItemId);
        } else if (code === 'KeyV') {
          event.preventDefault();
          store.pasteItem(focusRoomId);
        } else if (code === 'KeyD' && selectedItemId) {
          event.preventDefault();
          store.duplicateItem(selectedItemId);
        }
        return;
      }
      if (code === 'Escape') {
        if (carryingItemId) store.cancelCarry();
        else {
          store.selectItem(null);
          store.selectElement(null);
        }
        setSelectedSurface(null);
        setElectricalArmed(false);
      } else if (code === 'KeyR' && selectedItemId) {
        event.preventDefault();
        rotateSelected(event.shiftKey ? -1 : 1);
      } else if (code === 'KeyM' && selectedItemId) {
        event.preventDefault();
        store.mirrorItem(selectedItemId);
      } else if ((code === 'Delete' || code === 'Backspace') && view !== '2d') {
        if (selectedItemId) {
          const item = items.find((i) => i.id === selectedItemId);
          if (item && !item.locked) store.removeItem(selectedItemId);
        } else if (selectedElement) {
          const structural = selectedElement.kind === 'wall' || selectedElement.kind === 'opening' || selectedElement.kind === 'column' || selectedElement.kind === 'beam';
          if (structural && structureLocked) return;
          if (selectedElement.kind === 'wall') store.removeWall(selectedElement.id);
          if (selectedElement.kind === 'opening') store.removeOpening(selectedElement.roomId, selectedElement.id);
          if (selectedElement.kind === 'column') store.removeColumn(selectedElement.id);
          if (selectedElement.kind === 'beam') store.removeBeam(selectedElement.id);
          if (selectedElement.kind === 'electrical') store.removeElectricalPoint(selectedElement.id);
          if (selectedElement.kind === 'zone') store.removeFinishZone(selectedElement.roomId, selectedElement.id);
        }
      } else if (code === 'Digit1') setView('2d');
      else if (code === 'Digit2') setView('3d');
      else if (code === 'Digit3') setView('walk');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rotateSelected, selectedItemId, selectedElement, carryingItemId, store, focusRoomId, items, structureLocked, view]);

  const itemsPerRoom = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.roomId, (counts.get(item.roomId) ?? 0) + 1);
    return counts;
  }, [items]);

  /** Saves the design as it stands (a draft is enough) and returns the project id. */
  const ensureSaved = useCallback(() => saveDesign({ draft: true, nameKa: `${t.design.title} — ${new Date().toLocaleDateString('ka-GE')}` }), [t.design.title]);

  /** The tour opens what each card points at: the help card, the furniture shelf, the finishes. */
  const onTourStep = useCallback((index: number) => {
    if (index === 1) setNavOpen(true);
    if (index === 4) {
      setCategory('furniture');
      setTrayOpen(true);
    }
    if (index === 6) {
      setCategory('finishes');
      setTrayOpen(true);
    }
  }, []);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={5} />
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
  const tightSpots: Map<string, TightSpot> = tightSpotsByItem(plan.rooms, items);
  const roomNameOf = (id: string) => plan.rooms.find((r) => r.id === id)?.name ?? '';
  const lightsOn = electrical.filter((p) => p.kind.startsWith('light_') && p.on !== false).length;
  const currentStep = category === 'finishes' ? 6 : 5;

  /** The rail: the same category again folds its tray. */
  const pickCategory = (next: StudioCategory) => {
    if (next === category) setTrayOpen((v) => !v);
    else {
      setCategory(next);
      setTrayOpen(true);
    }
    setElectricalArmed(false);
    if (next !== 'build') setBuildTool('select');
    if (next === 'build' || next === 'electric') store.selectItem(null);
  };

  /** A build tool that draws needs the 2D board; the studio switches for it. */
  const pickBuildTool = (tool: EditorTool) => {
    setBuildTool(tool);
    if (tool !== 'select' && tool !== 'pan' && view !== '2d') setView('2d');
  };

  const endDragCarry = () => {
    if (dragCarry.current) {
      dragCarry.current = false;
      store.cancelCarry();
    }
  };

  /**
   * A tile picked up on the shelf: in 3D the product is put on the pointer at once
   * (`beginAdd`) — the tile's own picture is not dragged — and the model follows the drag
   * until it is dropped or the drag ends off the canvas.
   */
  const onDragProduct = (product: CatalogProduct | null) => {
    if (!product) {
      endDragCarry();
      return;
    }
    if (view !== '3d' || !viewerApi) return;
    if (store.beginAdd(product, focusRoomId) !== null) dragCarry.current = true;
  };

  /**
   * Dragging from a tray over the view: a carried product follows the pointer; a fitting
   * shows a ghost snapped to the nearest wall. Leaving the view takes the ghost away.
   */
  const onDragOver = (event: React.DragEvent) => {
    const types = event.dataTransfer.types;
    if (types.includes(FURNITURE_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (view === '3d' && viewerApi && dragCarry.current) viewerApi.moveCarriedTo(event.clientX, event.clientY);
      return;
    }
    if (types.includes(ELECTRICAL_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (view === '3d' && viewerApi && draggingKind) viewerApi.previewElectricalAt(draggingKind, event.clientX, event.clientY);
    }
  };
  const onDragLeave = (event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    viewerApi?.clearElectricalPreview();
  };

  /** A product or a fitting dragged from a tray and let go over the canvas. */
  const onDrop = (event: React.DragEvent) => {
    const kind = event.dataTransfer.getData(ELECTRICAL_DRAG_TYPE) as ElectricalKind | '';
    if (kind) {
      event.preventDefault();
      viewerApi?.clearElectricalPreview();
      const at = view === '3d' ? viewerApi?.fixtureSpotAt(kind, event.clientX, event.clientY) : null;
      if (at) {
        const id = store.addElectricalPoint(kind, at.position, at.roomId, products);
        if (id) store.selectElement({ kind: 'electrical', id });
      } else setRefused(true);
      return;
    }
    const raw = event.dataTransfer.getData(FURNITURE_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();
    const product = products.find((p) => p.id === Number(raw));
    if (!product) return;
    if (view === '2d' || !viewerApi) {
      const largest = [...plan.rooms].sort((a, b) => b.areaM2 - a.areaM2)[0];
      store.addItem(product, focusRoomId ?? largest.id);
      return;
    }
    if (dragCarry.current) {
      // Already on the pointer: set it down here. A spot that does not fit leaves it on the
      // pointer, outlined red, for the person to move.
      dragCarry.current = false;
      viewerApi.dropCarriedAt(event.clientX, event.clientY);
      return;
    }
    const at = viewerApi.floorPointAt(event.clientX, event.clientY);
    pendingDrop.current = { x: event.clientX, y: event.clientY };
    if (store.beginAdd(product, at?.roomId ?? focusRoomId ?? null) === null) pendingDrop.current = null;
  };

  /** An armed electrical kind lands where the 3D view is clicked. */
  const onWorkspaceClick = (event: React.MouseEvent) => {
    if (!electricalArmed || view !== '3d' || !viewerApi) return;
    const at = viewerApi.fixtureSpotAt(electricalKind, event.clientX, event.clientY);
    if (!at) return;
    const id = store.addElectricalPoint(electricalKind, at.position, at.roomId, products);
    if (id) store.selectElement({ kind: 'electrical', id });
  };

  const takePhoto = () => {
    if (!viewerApi) return;
    const dataUrl = viewerApi.screenshot();
    if (!dataUrl) return;
    setShot({ dataUrl, roomName: focusRoom?.name ?? null, camera: viewerApi.cameraPose() });
    setPhotoOpen(true);
  };

  /** Finish picks go where the scope says: the room, one wall, half the floor, a drawn zone. */
  const pickFinish = (surface: 'floor' | 'wall', product: CatalogProduct | null) => {
    const roomId = selectedSurface?.roomId ?? focusRoomId;
    const room = roomId ? plan.rooms.find((r) => r.id === roomId) : null;
    if (!room) {
      store.setFinish(plan.rooms.map((r) => r.id), surface, product);
      return;
    }
    if (surface === 'wall' && finishScope === 'wall' && selectedSurface?.wallIndex != null) {
      store.setWallFinish(room.id, selectedSurface.wallIndex, product);
      return;
    }
    if (surface === 'floor' && finishScope.startsWith('half-')) {
      const half = finishScope.slice(5) as 'left' | 'right' | 'top' | 'bottom';
      const zone = halfZone(room, half, `z${Date.now().toString(36)}`);
      if (zone && product) store.addFinishZone(room.id, zone, product);
      return;
    }
    if (surface === 'floor' && finishScope === 'zone' && selectedElement?.kind === 'zone') {
      store.updateFinishZone(selectedElement.roomId, selectedElement.id, { product });
      return;
    }
    store.setFinish([room.id], surface, product);
  };

  const inspectorActions = {
    updateWall: store.updateWall,
    removeWall: store.removeWall,
    updateOpening: store.updateOpening,
    removeOpening: store.removeOpening,
    addOpening: (roomId: string, kind: 'door' | 'window' | 'archway', wallIndex: number) => {
      const id = store.addOpening(roomId, kind, wallIndex);
      if (id) store.selectElement({ kind: 'opening', id, roomId });
      else setRefused(true);
    },
    updateColumn: store.updateColumn,
    removeColumn: store.removeColumn,
    updateBeam: store.updateBeam,
    removeBeam: store.removeBeam,
    updateTechnical: store.updateTechnicalPoint,
    removeTechnical: store.removeTechnicalPoint,
    updateElectrical: store.updateElectricalPoint,
    slideElectrical: store.slideElectricalPoint,
    removeElectrical: store.removeElectricalPoint,
    updateRoom: store.updateRoom,
    resizeRoom: store.resizeRoom,
    removeRoom: store.removeRoom,
    removeZone: store.removeFinishZone,
  };

  const hint = carryingItemId
    ? t.design.carryHint
    : view === 'walk'
      ? t.build.walkNoEdit
      : electricalArmed
        ? t.build.hintElectrical
        : category === 'build' && structureLocked
          ? t.build.structureLockedHint
          : category === 'build'
            ? t.build.trayHintBuild
            : category === 'furniture'
              ? t.build.trayHintFurniture
              : t.design.dragHint;

  const rightPanelOpen = (selected && view !== '2d' && category !== 'finishes') || selectedElement || versionsOpen;
  const showRightPanel = !!rightPanelOpen && view !== 'walk';
  const trayShown = trayOpen && view !== 'walk';

  // The finishes shelf: the room it applies to, what that surface has now, and the options.
  const finishRoom = plan.rooms.find((r) => r.id === (selectedSurface?.roomId ?? focusRoomId)) ?? null;
  const finishOptions = surfaceOptions(products, finishSurface, finishRoom, styleId);
  const baseFinishId = (roomId: string) => finishes.find((f) => f.roomId === roomId && f.surface === finishSurface && isBaseFinish(f))?.product?.productId ?? null;
  const currentFinishId: number | null | 'mixed' = (() => {
    if (!finishRoom) {
      const ids = plan.rooms.map((r) => baseFinishId(r.id));
      return ids.every((id) => id === ids[0]) ? (ids[0] ?? null) : 'mixed';
    }
    if (finishSurface === 'wall' && finishScope === 'wall' && selectedSurface?.wallIndex != null) {
      return finishes.find((f) => f.roomId === finishRoom.id && f.surface === 'wall' && f.wallIndex === selectedSurface.wallIndex)?.product?.productId ?? baseFinishId(finishRoom.id);
    }
    return baseFinishId(finishRoom.id);
  })();
  const finishArea = finishRoom
    ? finishSurface === 'wall' && finishScope === 'wall' && selectedSurface?.wallIndex != null
      ? `${fill(t.build.wallN, { n: selectedSurface.wallIndex + 1 })} · ${formatM2(wallEdgeAreaM2(finishRoom, selectedSurface.wallIndex))}`
      : finishSurface === 'floor'
        ? formatM2(finishRoom.areaM2)
        : null
    : null;

  return (
    <>
      <DesignSteps current={currentStep} />

      <div
        ref={setWorkspace}
        className={cn('relative w-full overflow-hidden bg-sand-light', fullscreen ? 'h-screen' : 'h-[calc(100vh-72px-48px)] min-h-[600px]')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClickCapture={onWorkspaceClick}
        data-tour="canvas"
      >
        {/* ---- canvas ---- */}
        <div className="absolute inset-0">
          {view === '2d' ? (
            <div className={cn('h-full w-full px-4 pt-20 transition-[padding] duration-300 md:pl-[19.5rem]', trayShown ? 'pb-56' : 'pb-16')}>
              <PlanWorkspace
                tools={CATEGORY_TOOLS[category]}
                tool={category === 'build' ? buildTool : category === 'electric' ? (electricalArmed ? 'electrical' : 'select') : category === 'finishes' && finishScope === 'zone' ? 'zone' : 'select'}
                onTool={(tool) => {
                  if (category === 'build') setBuildTool(tool);
                  if (category === 'electric') setElectricalArmed(tool === 'electrical');
                  if (category === 'finishes') setFinishScope(tool === 'zone' ? 'zone' : 'room');
                }}
                hideToolbar
                keyboardUndo={false}
                showTotals={false}
                furniture
                locked={structureLocked}
                electricalKind={electricalKind}
                layers={{ furniture: true, dimensions: category === 'build' }}
                height="100%"
                className="h-full"
                onRefused={() => setRefused(true)}
              />
            </div>
          ) : (
            <Viewer3D
              plan={plan}
              scene={scene}
              electrical={electrical}
              focusRoomId={focusRoomId}
              selectedItemId={selectedItemId}
              selectedElement={selectedElement}
              structureLocked={structureLocked}
              showWalls={showWalls}
              viewMode={view === 'walk' ? 'walk' : 'orbit'}
              editMode={editMode}
              daylightHour={DAYLIGHT_HOURS[daylight]}
              selectedOpeningId={selectedElement?.kind === 'opening' ? selectedElement.id : null}
              onMoveOpening={onMoveOpening}
              onSelectOpening={onSelectOpening}
              onSelectElement={onSelectElement}
              onOffsetWall={onOffsetWall}
              onMoveColumn={onMoveColumn}
              onMoveElectrical={onMoveElectrical}
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

        <StudioTopBar
          roomLabel={focusRoom ? focusRoom.name : t.design.wholeFlat}
          itemCount={visibleItems.length}
          saveState={saveState}
          view={view}
          onView={setView}
          showWalls={showWalls}
          onToggleWalls={() => setShowWalls((v) => !v)}
          onRegenerate={() => store.generate(products)}
          daylight={daylight}
          onDaylight={setDaylight}
          onPhoto={view !== '2d' && viewerApi ? takePhoto : undefined}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={store.undo}
          onRedo={store.redo}
          locked={structureLocked}
          onToggleLock={() => store.setStructureLocked(!structureLocked)}
          versionsOpen={versionsOpen}
          onVersions={() => setVersionsOpen((v) => !v)}
          onHelp={() => setTourOpen(true)}
          nextHref={category === 'finishes' ? '/design/summary' : '/design/studio?tool=finishes'}
          nextLabel={category === 'finishes' ? t.build.budgetTitle : t.design.step6}
        />

        {/* ---- left: the categories, the rooms beside them ---- */}
        <div className="pointer-events-auto absolute left-4 top-20 z-20 hidden items-start gap-2 md:flex">
          <CategoryRail category={category} trayOpen={trayShown} onCategory={pickCategory} badge={cost ? { budget: formatGEL(cost.grandTotal) } : undefined} />
          <div className="flex w-[188px] flex-col gap-1 rounded-[14px] bg-white/85 p-2 shadow-glass backdrop-blur-xl" data-tour="rooms">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.roomsInPlan}</p>
            <RoomRow label={t.design.wholeFlat} count={items.length} active={focusRoomId === null} onClick={() => store.setFocusRoom(null)} />
            {plan.rooms.map((room) => (
              <RoomRow key={room.id} label={room.name} count={itemsPerRoom.get(room.id) ?? 0} active={focusRoomId === room.id} onClick={() => store.setFocusRoom(room.id)} />
            ))}
          </div>
        </div>

        {refused && (
          <p role="alert" className="absolute left-4 top-[calc(5rem+2px)] z-30 rounded-[10px] border border-danger/40 bg-white/95 px-3 py-2 text-xs text-danger md:left-[20.5rem]">
            {t.design.openingRefused}
          </p>
        )}

        {/* ---- right panel: an overlay, nothing under it moves ---- */}
        {showRightPanel && (
          <div className={cn('pointer-events-auto absolute right-4 top-20 z-40 flex w-[360px] flex-col', trayShown ? 'bottom-56' : 'bottom-20')}>
            {versionsOpen ? (
              <FloatingPanel title={t.build.versions} subtitle={`${store.versions.length}`} onClose={() => setVersionsOpen(false)} className="h-full rounded-[16px]">
                <VersionsPanel />
              </FloatingPanel>
            ) : selected && category !== 'finishes' && view !== '2d' ? (
              <FloatingPanel title={t.design.selectedItem} subtitle={archetypeLabel(selected.kind, locale)} onClose={() => store.selectItem(null)} className="h-full rounded-[16px]">
                <SwapPanel
                  key={selected.id}
                  item={selected}
                  catalog={products}
                  styleId={styleId}
                  onSwap={(product) => store.swapProduct(selected.id, product)}
                  onRotate={rotateSelected}
                  rotateBlocked={rotateBlocked}
                  onRemove={() => store.removeItem(selected.id)}
                  onMirror={() => store.mirrorItem(selected.id)}
                  onDuplicate={() => store.duplicateItem(selected.id)}
                  onLock={(locked) => store.lockItem(selected.id, locked)}
                />
              </FloatingPanel>
            ) : selectedElement?.kind === 'electrical' && electrical.some((p) => p.id === selectedElement.id) ? (
              <FloatingPanel title={t.build.inspectorElectrical} subtitle={roomNameOf(electrical.find((p) => p.id === selectedElement.id)!.roomId)} onClose={() => store.selectElement(null)} className="h-full rounded-[16px]">
                <FixturePanel
                  key={selectedElement.id}
                  point={electrical.find((p) => p.id === selectedElement.id)!}
                  room={plan.rooms.find((r) => r.id === electrical.find((p) => p.id === selectedElement.id)!.roomId) ?? null}
                  catalog={products}
                  styleId={styleId}
                  onKind={(kind) => store.changeElectricalKind(selectedElement.id, kind, products)}
                  onSwap={(product) => store.setElectricalProduct(selectedElement.id, product)}
                  onUpdate={(patch) => store.updateElectricalPoint(selectedElement.id, patch)}
                  onSlide={(tt) => store.slideElectricalPoint(selectedElement.id, tt)}
                  onRemove={() => store.removeElectricalPoint(selectedElement.id)}
                />
              </FloatingPanel>
            ) : selectedElement && selectedElement.kind !== 'room' ? (
              <FloatingPanel title={elementTitle(selectedElement.kind, t)} onClose={() => store.selectElement(null)} className="h-full rounded-[16px]">
                <ElementInspector plan={plan} electrical={electrical} finishes={finishes} selection={selectedElement} actions={inspectorActions} locked={structureLocked} className="border-0 p-0" />
                {selectedElement.kind === 'zone' && (
                  <div className="mt-3">
                    <FinishPanel roomId={selectedElement.roomId} surface="floor" rooms={plan.rooms} catalog={products} styleId={styleId} finishes={finishes} onRoom={(id) => store.setFocusRoom(id)} onPick={(surface, product) => (surface === 'floor' ? store.updateFinishZone(selectedElement.roomId, selectedElement.id, { product }) : pickFinish(surface, product))} />
                  </div>
                )}
              </FloatingPanel>
            ) : null}
          </div>
        )}

        {/* ---- bottom: the hint, a warning, and the open category's tray, centred on the canvas ---- */}
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex flex-col items-center gap-2">
          {visibleItems.some((i) => tightSpots.has(i.id)) && view !== '2d' && (
            <p className="hidden items-center gap-1.5 rounded-[10px] bg-warning/90 px-3 py-1 text-[11px] font-medium text-ink md:flex">
              <AlertTriangle className="h-3 w-3" />
              {t.design.tightPassageHint}
            </p>
          )}
          <p className="hidden rounded-[10px] bg-ink/70 px-3 py-1 text-xs text-white backdrop-blur md:block">{hint}</p>
          {trayShown && (
            <div className="pointer-events-auto w-full max-w-[880px]">
              <Tray>
                {category === 'build' && <BuildTray tool={buildTool} onTool={pickBuildTool} thicknessM={thicknessM} onThickness={(m) => { setThicknessM(m); store.setPlanDefaults({ wallThicknessM: m }); }} in3d={view === '3d'} locked={structureLocked} onUnlock={() => store.setStructureLocked(false)} />}
                {category === 'furniture' && (
                  <FurnitureTray
                    catalog={products}
                    styleId={styleId}
                    roomLabel={focusRoom?.name ?? t.design.wholeFlat}
                    onPick={(product) => store.beginAdd(product, focusRoomId) !== null}
                    onDragProduct={onDragProduct}
                  />
                )}
                {category === 'electric' && (
                  <ElectricTray
                    kind={electricalKind}
                    onKind={setElectricalKind}
                    armed={electricalArmed}
                    onArm={setElectricalArmed}
                    onSuggest={() => store.suggestElectrical(products)}
                    onClear={store.clearElectrical}
                    lightsOn={lightsOn}
                    onDragKind={(kind) => {
                      setDraggingKind(kind);
                      if (!kind) viewerApi?.clearElectricalPreview();
                    }}
                  />
                )}
                {category === 'finishes' && (
                  <FinishesTray
                    surface={finishSurface}
                    onSurface={(surface) => {
                      setFinishSurface(surface);
                      setFinishScope('room');
                    }}
                    scope={finishScope}
                    onScope={(scope) => {
                      setFinishScope(scope);
                      if (scope === 'zone' && view === '3d') setView('2d');
                    }}
                    hasWall={selectedSurface?.surface === 'wall' && selectedSurface.wallIndex != null}
                    roomName={finishRoom?.name ?? null}
                    areaLabel={finishArea}
                    in3d={view === '3d'}
                    onGo2d={() => setView('2d')}
                    options={finishOptions}
                    currentId={currentFinishId}
                    onPick={(product) => pickFinish(finishSurface, product)}
                  />
                )}
                {category === 'budget' && cost && <BudgetTray cost={cost} />}
              </Tray>
            </div>
          )}
        </div>

        {/* ---- help and zoom ---- */}
        <div className={cn('pointer-events-auto absolute right-4 z-30 flex flex-col items-end gap-2', trayShown ? 'bottom-56' : 'bottom-20')}>
          <NavHelp walking={view === 'walk'} onTour={() => setTourOpen(true)} open={navOpen} onOpenChange={setNavOpen} />
          <ZoomControls onZoom={(f) => viewerApi?.zoom(f)} onReset={() => viewerApi?.reset()} onFullscreen={toggleFullscreen} fullscreen={fullscreen} disabled={view !== '3d' || !viewerApi} />
        </div>

        <HoverCard ref={hoverCard} />
        <TutorialOverlay open={tourOpen} onClose={() => setTourOpen(false)} container={workspaceEl} onStep={onTourStep} />
      </div>

      <PhotoDialog shot={shot} open={photoOpen} onOpenChange={setPhotoOpen} ensureSaved={ensureSaved} />
    </>
  );
}

function elementTitle(kind: NonNullable<ReturnType<typeof useDesignStore.getState>['selectedElement']>['kind'], t: ReturnType<typeof useT>): string {
  switch (kind) {
    case 'wall':
      return t.build.inspectorWall;
    case 'opening':
      return t.build.inspectorOpening;
    case 'column':
      return t.build.inspectorColumn;
    case 'beam':
      return t.build.inspectorBeam;
    case 'technical':
      return t.build.inspectorTechnical;
    case 'electrical':
      return t.build.inspectorElectrical;
    case 'zone':
      return t.build.inspectorZone;
    default:
      return t.build.inspectorRoom;
  }
}

function RoomRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-xs transition-colors', active ? 'bg-ink text-white' : 'hover:bg-white')}
    >
      <span className="truncate">{label}</span>
      <span className={cn('shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-white/15' : 'bg-bg-base text-ink-muted')}>{count}</span>
    </button>
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
