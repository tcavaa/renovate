'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Loader2, Trash2 } from 'lucide-react';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { AskFurnitureDialog } from '@/components/calculator/AskFurnitureDialog';
import { RoomFinishCards, type FinishTarget } from '@/components/calculator/RoomFinishCards';
import { RoomRow } from '@/components/calculator/RoomRow';
import { ProductCard } from '@/components/catalog/ProductCard';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { SideList } from '@/components/flow/SideList';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { aggregateRoomTotals } from '@/lib/calculator/materials';
import { roomFinishEntry, roomFinishesOf, roomsLike, surfaceOfCategory, usualFinishCategory, type FinishSurface } from '@/lib/calculator/roomFinishes';
import { BATH_ROOM_TYPES } from '@/lib/calculator/constants';
import { useT, useLocale } from '@/lib/i18n/client';
import { localizedName, pickLocalizedName, roomTypeLabel, unitLabel } from '@/lib/i18n/labels';
import { cn, formatGEL, formatM2, formatNumber } from '@/lib/utils';
import type { Category, Product } from '@/lib/db/schema';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import { roomIdFromKey, roomWallAreasM2, roomWalls, selectionKey, suggestedQuantity } from '@/lib/calculator/quantities';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { useProjectId } from '@/components/projects/ProjectGate';

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

/** What a product is on the sheet: the catalogue row's names, price, unit and look, at no quantity yet. */
function snapshotOf(p: Product, categorySlug: string): SelectedProduct {
  return {
    productId: p.id,
    nameKa: p.nameKa,
    nameEn: p.nameEn,
    nameRu: p.nameRu,
    pricePerUnit: Number(p.pricePerUnit),
    unit: p.unit,
    qty: 0,
    totalPrice: 0,
    imageUrl: p.imageUrl,
    categorySlug,
    slug: p.slug,
    textureUrl: p.textureUrl,
    colorHex: p.colorHex,
    coveragePerUnit: p.coveragePerUnit == null ? null : Number(p.coveragePerUnit),
    specs: p.specs,
  };
}

const isWetProduct = (p: Product) => !!(p.specs as { wet?: boolean } | null | undefined)?.wet;

/**
 * Step 4: the catalogue. Every room takes its floor and its walls (`lib/calculator/roomFinishes`)
 * — the floor in one product or two sharing it by a slider, the walls in one product for the
 * whole room or wall by wall, each wall listed with its area — and what each comes to is
 * counted from the room, with the cutting waste, so nothing is laid by hand: the placement step
 * that followed this one until September 2026 is gone. A room's floor and walls are offered
 * from the categories its kind of work is done in first (tiles in the bathroom, laminate in the
 * bedroom), and a choice can be copied to the rooms like it that have none yet. Everything else
 * — sockets, lights, sanitary ware, doors, windows — is one product for the whole flat, counted
 * from the rooms as before. Nothing is required: with nothing chosen the estimate is the
 * renovation alone.
 */
export default function CatalogStepPage() {
  const t = useT();
  const locale = useLocale();
  const projectId = useProjectId();
  const { rooms, homeState, selectedProducts, selectProduct, setRoomFinish, setFloorProduct, setFloorShare, setWallProduct, setWallsOneByOne, copyRoomFinish, removeProduct } = useCalculatorStore();
  // The calculator's own board: the rooms where they lie, and each one's outline for the little drawing beside each of its walls.
  const boardPlan = useCalculatorPlanStore((s) => s.plan);
  const { items: categories, loading: catLoading } = useCategories(false);

  /** What the middle shows: a room (`room:<id>`) or a category for the whole flat (`cat:<slug>`). */
  const [active, setActive] = useState<string | null>(null);
  /** What the product grid chooses for in the open room: one of its floor's two products, its walls, or one wall. */
  const [target, setTarget] = useState<FinishTarget>({ surface: 'floor', slot: 0 });
  /** Rooms switched to "per wall" before any wall was chosen — once one is, the picks say so. */
  const [perWall, setPerWall] = useState<Record<string, boolean>>({});
  /** The finish category open for a room's surface, when the person chose one (`<roomId>:<surface>` → slug). */
  const [finishTab, setFinishTab] = useState<Record<string, string>>({});
  const [askFurniture, setAskFurniture] = useState(false);

  const finishCategories = useMemo(() => ({ floor: categories.filter((c) => surfaceOfCategory(c) === 'floor'), wall: categories.filter((c) => surfaceOfCategory(c) === 'wall') }), [categories]);
  const otherCategories = useMemo(() => categories.filter((c) => !surfaceOfCategory(c)), [categories]);

  const activeId = active ?? (rooms[0] ? `room:${rooms[0].id}` : otherCategories[0] ? `cat:${otherCategories[0].slug}` : null);
  const room = activeId?.startsWith('room:') ? rooms.find((r) => `room:${r.id}` === activeId) ?? null : null;
  const category = !room && activeId?.startsWith('cat:') ? otherCategories.find((c) => `cat:${c.slug}` === activeId) ?? null : null;

  const finishes = room ? roomFinishesOf(selectedProducts, room) : null;
  const oneByOne = !!room && !!finishes && (finishes.byWall ? true : finishes.walls ? false : !!perWall[room.id]);
  const wallAreas = room ? roomWallAreasM2(room) : [];
  // What the grid is choosing for, as the room has it: a second floor product only once there
  // is a first, one wall only while the walls are chosen one by one.
  const aim: FinishTarget =
    target.surface === 'floor'
      ? { surface: 'floor', slot: target.slot === 1 && (finishes?.floor.length ?? 0) > 0 ? 1 : 0 }
      : oneByOne
        ? { surface: 'wall', wall: target.wall != null && target.wall < wallAreas.length ? target.wall : 0 }
        : { surface: 'wall', wall: null };
  const surface: FinishSurface = aim.surface;
  const aimed = !finishes ? null : aim.surface === 'floor' ? (finishes.floor[aim.slot]?.[1] ?? null) : aim.wall == null ? (finishes.walls?.[1] ?? null) : (finishes.byWall?.[aim.wall] ?? null);
  // The room's own outline on the board, edge i being wall i, else its rectangle.
  const drawn = room ? boardPlan?.rooms.find((r) => r.id === room.id)?.polygon : undefined;
  const outline = !room ? [] : drawn && drawn.length === roomWalls(room).length ? drawn : [{ x: 0, z: 0 }, { x: room.width, z: 0 }, { x: room.width, z: room.length }, { x: 0, z: room.length }];

  // The surface opens on the category of what the row in hand has, else the one the person
  // opened, else the one the room's kind of work is done in.
  const surfaceCategories = orderedFinishCategories(finishCategories[surface], room, surface);
  const finishSlug = room ? finishTab[`${room.id}:${surface}`] ?? aimed?.categorySlug ?? surfaceCategories[0]?.slug ?? null : null;
  const openSlug = room ? finishSlug : category?.slug ?? null;
  const { items: products, loading } = useProducts(openSlug, 1, 60);
  const bath = !!room && BATH_ROOM_TYPES.includes(room.type);
  // A bathroom's tiles are made for the wet: those first.
  const shown = bath ? [...products].sort((a, b) => Number(isWetProduct(b)) - Number(isWetProduct(a))) : products;

  const totals = useMemo(() => aggregateRoomTotals(rooms), [rooms]);
  const chosen = useMemo(() => Object.entries(selectedProducts), [selectedProducts]);
  const totalSelected = useMemo(() => chosen.reduce((s, [, p]) => s + p.totalPrice, 0), [chosen]);

  if (rooms.length === 0 || !homeState) {
    return (
      <>
        <StepIndicator current={4} />
        <EmptyStep message={t.calculator.needRoomsFirst} back={t.common.back} href={calculatorStepHref(projectId, homeState ? 2 : 1)} />
      </>
    );
  }

  const surfaceName = (s: FinishSurface) => (s === 'floor' ? t.calculator.summaryFloor : t.calculator.summaryWalls);
  const roomChosenCount = (r: Room) => (roomFinishEntry(selectedProducts, r.id, 'floor') ? 1 : 0) + (roomFinishEntry(selectedProducts, r.id, 'wall') ? 1 : 0);

  const choose = (p: Product) => {
    if (room && finishSlug) {
      // The same product again takes it off what the row in hand is.
      const pick = aimed?.productId === p.id ? null : { ...snapshotOf(p, finishSlug), surface };
      if (aim.surface === 'floor') setFloorProduct(room.id, aim.slot, pick);
      else if (aim.wall == null) setRoomFinish([room.id], 'wall', pick);
      else chooseForWall(aim.wall, pick);
      return;
    }
    if (!category) return;
    const key = selectionKey(category.slug);
    if (selectedProducts[key]?.productId === p.id) {
      removeProduct(key);
      return;
    }
    const qty = suggestedQuantity(category.slug, totals) || 1;
    selectProduct(key, { ...snapshotOf(p, category.slug), qty, totalPrice: Math.round(Number(p.pricePerUnit) * qty * 100) / 100 });
  };
  const isChosen = (p: Product): boolean => (room ? aimed?.productId === p.id : !!category && selectedProducts[selectionKey(category.slug)]?.productId === p.id);

  /** Another room (`room:<id>`): the grid goes on choosing for the same surface there, from its first row. */
  const openRoom = (id: string) => {
    setActive(id);
    setTarget((t) => (t.surface === 'floor' ? { surface: 'floor', slot: 0 } : { surface: 'wall', wall: 0 }));
  };
  /** One wall's product; the room stays per wall even when its last wall is emptied. */
  const chooseForWall = (wall: number, pick: SelectedProduct | null) => {
    if (!room) return;
    setPerWall((m) => ({ ...m, [room.id]: true }));
    setWallProduct(room.id, wall, pick);
  };
  const setWallsMode = (next: boolean) => {
    if (!room) return;
    setPerWall((m) => ({ ...m, [room.id]: next }));
    setWallsOneByOne(room.id, next);
    setTarget({ surface: 'wall', wall: next ? 0 : null });
  };
  const aimLabel = !room
    ? ''
    : aim.surface === 'floor'
      ? (finishes?.floor.length ?? 0) === 2 || aim.slot === 1
        ? aim.slot === 0
          ? t.calculator.floorFirstTarget
          : t.calculator.floorSecondTarget
        : `${t.calculator.summaryFloor} · ${formatM2(room.floorM2)}`
      : aim.wall == null
        ? `${t.calculator.summaryWalls} · ${formatM2(room.wallM2)}`
        : `${fill(t.calculator.wallN, { n: aim.wall + 1 })} · ${formatM2(wallAreas[aim.wall] ?? 0)}`;
  /** The rooms of the same kind with nothing chosen yet for each surface — "the same in N more rooms like this". */
  const like: Record<FinishSurface, Room[]> = { floor: [], wall: [] };
  if (room) for (const s of ['floor', 'wall'] as const) like[s] = roomsLike(rooms, room, s).filter((r) => !roomFinishEntry(selectedProducts, r.id, s));
  /** Where in its room a pick is: the walls it was chosen for, its share of the floor, or its surface. */
  const placeOf = (p: SelectedProduct): string => {
    if (p.walls?.length) return fill(p.walls.length === 1 ? t.calculator.wallN : t.calculator.wallsN, { n: [...p.walls].sort((a, b) => a - b).map((i) => i + 1).join(', ') });
    if (p.share != null) return `${t.calculator.summaryFloor} ${Math.round(p.share * 100)}%`;
    return p.surface ? surfaceName(p.surface) : '';
  };

  return (
    <>
      <StepIndicator current={4} />
      <div className="container py-10 md:py-14">
        <StepHeader step={4} total={CALCULATOR_STEPS} title={t.calculator.step3} subtitle={t.calculator.catalogSubtitle} />

        {/* The rooms, side by side: each with the flat drawn small and itself picked out on it. */}
        <RoomRow
          title={t.calculator.finishesTitle}
          rooms={rooms}
          board={boardPlan}
          activeRoomId={room?.id ?? null}
          onSelect={(id) => openRoom(`room:${id}`)}
          status={(r) => {
            const n = roomChosenCount(r);
            return { text: n === 2 ? '✓' : `${n}/2`, done: n === 2 };
          }}
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {catLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse bg-line/50" />
                ))}
              </div>
            ) : (
              otherCategories.length > 0 && (
                <SideList
                  title={t.calculator.otherProducts}
                  activeId={activeId}
                  onSelect={setActive}
                  items={otherCategories.map((c) => ({
                    id: `cat:${c.slug}`,
                    label: pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu),
                    count: selectedProducts[selectionKey(c.slug)] ? '✓' : undefined,
                  }))}
                />
              )
            )}
          </aside>

          <section className="min-w-0">
            {room ? (
              <>
                <div className="mb-4 border-b border-line pb-3">
                  <h2 className="font-serif text-xl font-semibold text-ink">{room.nameKa || roomTypeLabel(t, room.type)}</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {roomTypeLabel(t, room.type)} · {t.calculator.summaryFloor} {formatM2(room.floorM2)} · {t.calculator.summaryWalls} {formatM2(room.wallM2)}
                  </p>
                </div>

                {/* The room's floor and walls, and which row of them the grid is choosing for. */}
                {finishes && (
                  <RoomFinishCards
                    room={room}
                    finishes={finishes}
                    target={aim}
                    onTarget={setTarget}
                    oneByOne={oneByOne}
                    onOneByOne={setWallsMode}
                    outline={outline}
                    like={like}
                    onCopy={(s) => copyRoomFinish(room.id, like[s].map((r) => r.id), s)}
                    onClearFloor={(slot) => {
                      setFloorProduct(room.id, slot, null);
                      setTarget({ surface: 'floor', slot: 0 });
                    }}
                    onClearWalls={() => setRoomFinish([room.id], 'wall', null)}
                    onClearWall={(i) => chooseForWall(i, null)}
                    onShare={(share) => setFloorShare(room.id, share)}
                  />
                )}

                {/* The categories the surface in hand is finished from, the room's usual one first. */}
                <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label={surfaceName(surface)}>
                  {surfaceCategories.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      role="tab"
                      aria-selected={finishSlug === c.slug}
                      onClick={() => setFinishTab((tabs) => ({ ...tabs, [`${room.id}:${surface}`]: c.slug }))}
                      className={cn('border px-3 py-1.5 text-sm transition-colors', finishSlug === c.slug ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface text-ink hover:border-ink/40')}
                    >
                      {pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu)}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-ink-muted" title={t.calculator.finishesHint}>
                    {fill(t.calculator.choosingFor, { what: aimLabel })}
                  </span>
                </div>
              </>
            ) : (
              <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-3">
                <h2 className="font-serif text-xl font-semibold text-ink">{category ? pickLocalizedName(locale, category.nameKa, category.nameEn, category.nameRu) : '…'}</h2>
                {category && <p className="text-right text-xs text-ink-muted">{t.calculator.forWholeFlat} · {t.calculator.autoQuantity}</p>}
              </div>
            )}

            <div className={cn(room && 'mt-4')}>
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
                </div>
              ) : !openSlug || shown.length === 0 ? (
                <div className="border border-dashed border-line p-16 text-center text-sm text-ink-muted">{t.catalog.noProducts}</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((p) => (
                    <ProductCard key={p.id} product={p} selected={isChosen(p)} onAction={() => choose(p)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* What is chosen: each room's floor and walls, and the rest for the whole flat. */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">
                  {t.calculator.chosenTitle} <span className="text-ink">{chosen.length}</span>
                </p>
              </div>
              {chosen.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.calculator.chosenEmpty}</p>
              ) : (
                <ul>
                  {chosen.map(([key, p]) => {
                    const where = roomIdFromKey(key);
                    const inRoom = where ? rooms.find((r) => r.id === where) : null;
                    return (
                      <li key={key} className="flex items-start gap-3 border-b border-line px-4 py-3 text-sm">
                        <span className="relative mt-0.5 block h-9 w-9 shrink-0 overflow-hidden border border-line bg-bg-base">
                          {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="36px" className="object-cover" /> : p.colorHex ? <span className="block h-full w-full" style={{ backgroundColor: p.colorHex }} /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-medium text-ink">{localizedName(locale, p)}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                            {inRoom ? `${[inRoom.nameKa || roomTypeLabel(t, inRoom.type), placeOf(p)].filter(Boolean).join(' · ')} · ` : ''}
                            {formatNumber(p.qty, p.unit === 'm2' ? 1 : 0)} {unitLabel(t, p.unit)} × {formatGEL(p.pricePerUnit)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-semibold tabular-nums">{formatGEL(p.totalPrice)}</span>
                          <button type="button" onClick={() => removeProduct(key)} aria-label={t.calculator.removeChoice} title={t.calculator.removeChoice} className="grid h-7 w-7 place-items-center text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex items-baseline justify-between px-4 py-3">
                <span className="text-sm text-ink-muted">{t.calculator.total}</span>
                <span className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(totalSelected)}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <StepNav back={{ href: calculatorStepHref(projectId, 3), label: t.calculator.backButton }} next={{ label: t.calculator.nextButton, onClick: () => setAskFurniture(true) }}>
        <p className="text-sm text-ink-muted sm:text-right">
          {t.calculator.chosenTitle} {chosen.length} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(totalSelected)}</span>
        </p>
      </StepNav>

      <AskFurnitureDialog open={askFurniture} onOpenChange={setAskFurniture} />
    </>
  );
}

/** A surface's finish categories with the one the room's kind of work is done in first. */
function orderedFinishCategories(list: Category[], room: Room | null, surface: FinishSurface): Category[] {
  if (!room) return list;
  const usual = usualFinishCategory(room.type, surface);
  return [...list].sort((a, b) => Number(b.slug === usual) - Number(a.slug === usual));
}
