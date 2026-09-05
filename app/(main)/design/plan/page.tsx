'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, Trash2, TriangleAlert } from 'lucide-react';
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

export default function PlanReviewPage() {
  const t = useT();
  const { plan, updateRoom, resizeRoom, addRoom, removeRoom } = useDesignStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!plan || plan.rooms.length === 0) {
    return <NeedPlan />;
  }

  return (
    <>
      <DesignSteps current={2} />
      <div className="container py-8">
        <header className="mb-6">
          <h1 className="font-serif text-2xl font-bold md:text-3xl">{t.design.reviewTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.design.reviewSubtitle}</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="overflow-hidden rounded-lg border border-line bg-bg-surface shadow-card">
            <PlanCanvas
              plan={plan}
              selectedRoomId={selectedId}
              hoveredRoomId={hoveredId}
              onSelectRoom={setSelectedId}
              onHoverRoom={setHoveredId}
              className="w-full cursor-pointer"
              height={520}
            />
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-ink-muted">
                {plan.rooms.length} × {t.design.step2}
              </span>
              <span className="font-semibold">
                {t.design.planTotal}: {formatM2(totalFloorAreaM2(plan))}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {plan.rooms.map((room) => {
                const active = room.id === selectedId;
                return (
                  <div
                    key={room.id}
                    onMouseEnter={() => setHoveredId(room.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedId(room.id)}
                    className={cn(
                      'rounded-lg border bg-bg-surface p-3 transition-colors',
                      active ? 'border-brand ring-1 ring-brand/25' : 'border-line'
                    )}
                  >
                    <div className="flex items-start gap-2">
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

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => addRoom(t.design.newRoom)}
            >
              <Plus className="h-4 w-4" />
              {t.design.addRoom}
            </Button>

            <Button asChild size="lg" className="w-full">
              <Link href="/design/style">
                {t.design.continueToStyle}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
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
