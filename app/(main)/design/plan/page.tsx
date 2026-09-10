'use client';

import { useEffect, useRef, useState } from 'react';
import { DoorOpen, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanCanvas } from '@/components/design/PlanCanvas';
import { OpeningPalette } from '@/components/design/OpeningPalette';
import { OpeningsPanel } from '@/components/design/OpeningsPanel';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { isAutoRoomName, nextRoomName, polygonBounds, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { formatM2, cn } from '@/lib/utils';
import type { RoomType } from '@/lib/calculator/types';

const ROOM_TYPE_OPTIONS: RoomType[] = [
  'living_room',
  'bedroom',
  'kitchen',
  'bathroom',
  'toilet',
  'hallway',
  'office',
  'storage',
  'balcony',
];

/**
 * Step 2: check what the parser (or the person) produced. Names, types, heights and sizes
 * on the right; the plan on the left with a door and a window beside it to drag onto any
 * wall, where every door and window can be dragged along its wall, onto another wall, or
 * into the bin — and, under the plan, the selected room's openings as small cards to move,
 * resize, turn into a window, add or remove.
 */
export default function PlanReviewPage() {
  const t = useT();
  const { plan, updateRoom, resizeRoom, addRoom, removeRoom, addOpening, dropOpening, moveOpening, moveOpeningToWall, updateOpening, setOpeningWall, removeOpening } = useDesignStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!refused) return;
    const handle = window.setTimeout(() => setRefused(false), 2200);
    return () => window.clearTimeout(handle);
  }, [refused]);

  /**
   * Brings a room's row into view inside the list's own scroll box — not with
   * `scrollIntoView`, which would scroll the page as well and yank the plan away from
   * under the pointer.
   */
  const revealRoom = (id: string) => {
    const list = listRef.current;
    const row = document.getElementById(`plan-room-${id}`);
    if (!list || !row) return;
    const top = row.offsetTop - 12;
    const bottom = row.offsetTop + row.offsetHeight + 12;
    if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
  };

  if (!plan || plan.rooms.length === 0) {
    return <NeedPlan />;
  }

  const selectedRoom = plan.rooms.find((r) => r.id === selectedId) ?? null;
  const selectOpening = (roomId: string, openingId: string) => {
    setSelectedId(roomId);
    setSelectedOpeningId(openingId);
    revealRoom(roomId);
  };

  return (
    <>
      <DesignSteps current={2} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={2}
          total={5}
          title={t.design.reviewTitle}
          subtitle={t.design.reviewSubtitle}
          meta={
            <>
              <span>{plan.rooms.length} × {t.design.step2}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatM2(totalFloorAreaM2(plan))}</span>
            </>
          }
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden border border-line bg-bg-surface">
              <div className="flex">
                {/* A door and a window to drag onto any wall of the plan. */}
                <OpeningPalette className="w-28 shrink-0 border-r border-line bg-bg-base/60" />
                <div className="relative min-w-0 flex-1">
                  <PlanCanvas
                    plan={plan}
                    selectedRoomId={selectedId}
                    hoveredRoomId={hoveredId}
                    selectedOpeningId={selectedOpeningId}
                    onSelectRoom={(id) => {
                      setSelectedId(id);
                      setSelectedOpeningId(null);
                      // The list is long on a real flat: bring the clicked room's row into view.
                      if (id) revealRoom(id);
                    }}
                    onSelectOpening={selectOpening}
                    onMoveOpening={moveOpening}
                    onMoveOpeningToWall={moveOpeningToWall}
                    onRemoveOpening={(roomId, id) => {
                      removeOpening(roomId, id);
                      if (selectedOpeningId === id) setSelectedOpeningId(null);
                    }}
                    onDropOpening={dropOpening}
                    onRefused={() => setRefused(true)}
                    onDragState={setDragging}
                    trashRef={trashRef}
                    onHoverRoom={setHoveredId}
                    className="w-full cursor-pointer"
                    height={520}
                  />
                  {/* The bin: shown while a door or window is being dragged on the plan. */}
                  <div
                    ref={trashRef}
                    className={cn(
                      'absolute bottom-3 right-3 items-center gap-2 border border-dashed border-danger/60 bg-white/95 px-4 py-3 text-xs font-medium text-danger shadow-card',
                      dragging ? 'flex' : 'hidden'
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t.design.trashDrop}
                  </div>
                  {refused && (
                    <p role="alert" className="absolute left-3 top-3 border border-danger/40 bg-white/95 px-3 py-2 text-xs text-danger">
                      {t.design.openingRefused}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
                <span className="eyebrow">{plan.rooms.length} × {t.design.step2}</span>
                <span className="text-xs text-ink-muted">{t.design.planOpeningsHint}</span>
                <span className="font-serif text-base font-semibold text-ink">
                  {t.design.planTotal}: {formatM2(totalFloorAreaM2(plan))}
                </span>
              </div>
            </div>

            {/* Doors and windows of the selected room, four to a row. */}
            <section className="mt-6 border border-line bg-bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
                <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink">
                  <DoorOpen className="h-4 w-4 text-ink-muted" />
                  {t.design.openingsTitle}
                  {selectedRoom && <span className="text-sm font-normal text-ink-muted">· {selectedRoom.name}</span>}
                </h2>
                {selectedRoom && <span className="text-xs tabular-nums text-ink-muted">{selectedRoom.openings.length}</span>}
              </div>
              {selectedRoom ? (
                <div className="mt-3">
                  <OpeningsPanel
                    rooms={plan.rooms}
                    roomId={selectedRoom.id}
                    selectedId={selectedOpeningId}
                    showRoomSelect={false}
                    layout="grid"
                    onRoom={(id) => {
                      setSelectedId(id);
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
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-ink-muted">{t.design.selectRoomForOpenings}</p>
              )}
            </section>
          </div>

          {/* The room list scrolls on its own beside the sticky plan, so a click on the plan
              brings the room's row into view here without moving the page. */}
          <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <div ref={listRef} className="relative max-h-[calc(100vh-11rem)] overflow-y-auto border border-line bg-bg-surface">
              {plan.rooms.map((room, index) => {
                const active = room.id === selectedId;
                return (
                  <div
                    key={room.id}
                    id={`plan-room-${room.id}`}
                    onMouseEnter={() => setHoveredId(room.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedId(room.id)}
                    className={cn('relative border-b border-line p-3 pl-4 transition-colors last:border-b-0', active ? 'bg-sand-light' : 'hover:bg-sand-light/60')}
                  >
                    <span className={cn('absolute inset-y-0 left-0 w-[2px]', active ? 'bg-ink' : 'bg-transparent')} />
                    <div className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 shrink-0 text-xs tabular-nums text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={room.name}
                          onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                          className="h-9"
                          aria-label={t.design.roomNameLabel}
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={room.type}
                            onValueChange={(value) => {
                              const type = value as RoomType;
                              // A generated name follows the type; a name the user typed stays.
                              const name = isAutoRoomName(room.name)
                                ? nextRoomName(plan.rooms, type, room.id)
                                : room.name;
                              updateRoom(room.id, { type, name });
                            }}
                          >
                            <SelectTrigger className="h-9" aria-label={t.design.roomTypeLabel}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROOM_TYPE_OPTIONS.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {roomTypeLabel(t, type)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Input
                            type="number"
                            min={1.8}
                            max={6}
                            step={0.05}
                            value={room.heightM}
                            onChange={(e) =>
                              updateRoom(room.id, {
                                heightM: Math.min(6, Math.max(1.8, Number(e.target.value) || 2.8)),
                              })
                            }
                            className="h-9"
                            aria-label={t.design.ceilingHeightLabel}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <SizeInput
                            label={t.design.roomWidth}
                            value={polygonBounds(room.polygon).width}
                            onCommit={(next) =>
                              resizeRoom(room.id, next, polygonBounds(room.polygon).depth)
                            }
                          />
                          <SizeInput
                            label={t.design.roomDepth}
                            value={polygonBounds(room.polygon).depth}
                            onCommit={(next) =>
                              resizeRoom(room.id, polygonBounds(room.polygon).width, next)
                            }
                          />
                        </div>

                        <p className="text-xs text-ink-muted">
                          {t.design.roomAreaLabel}: {formatM2(room.areaM2)}
                          <span className="mx-1.5 text-ink-faint">·</span>
                          {t.design.openingsTitle}: {room.openings.length}
                        </p>

                        {room.lowConfidence && (
                          <p className="flex items-center gap-1.5 text-xs text-warning">
                            <TriangleAlert className="h-3.5 w-3.5" />
                            {t.design.lowConfidence}
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t.design.deleteRoom}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRoom(room.id);
                          if (selectedId === room.id) setSelectedId(null);
                        }}
                        className="text-ink-muted hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={() => addRoom(t.design.newRoom)}>
              <Plus className="h-4 w-4" />
              {t.design.addRoom}
            </Button>
          </div>
        </div>
      </div>

      <StepNav back={{ href: '/design', label: t.calculator.backButton }} next={{ href: '/design/style', label: t.design.continueToStyle }} />
    </>
  );
}

/**
 * A dimension field that only commits on blur or Enter.
 *
 * Resizing rebuilds the room's outline and re-derives its doors, so doing that on every
 * keystroke would fight the person typing "3.5" the moment they got to "3".
 */
function SizeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value.toFixed(2));

  useEffect(() => setDraft(value.toFixed(2)), [value]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0.8 || next > 40) {
      setDraft(value.toFixed(2));
      return;
    }
    if (Math.abs(next - value) > 0.005) onCommit(next);
  };

  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-ink-muted">{label}</span>
      <Input
        type="number"
        min={0.8}
        max={40}
        step={0.1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // Commit directly rather than relying on blur — some browsers swallow the blur that
          // Enter would otherwise cause in a number field.
          commit();
          e.currentTarget.blur();
        }}
        className="h-9"
      />
    </label>
  );
}

function NeedPlan() {
  const t = useT();
  return (
    <>
      <DesignSteps current={2} />
      <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
    </>
  );
}
