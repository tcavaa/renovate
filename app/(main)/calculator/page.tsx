'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { AlertCircle, PenLine, Rows3, Upload } from 'lucide-react';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { RoomForm } from '@/components/calculator/RoomForm';
import { RoomList } from '@/components/calculator/RoomList';
import { RoomLayoutEditor, type DrawnRect } from '@/components/calculator/RoomLayoutEditor';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { calculatorRoomsFromPlan } from '@/lib/design/planGeometry';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { findFreeSpot } from '@/lib/calculator/layout';
import { cn } from '@/lib/utils';
import type { Room } from '@/lib/calculator/types';

type PlanMode = 'upload' | 'manual' | 'draw';

export default function CalculatorStep1Page() {
  const router = useRouter();
  const t = useT();
  const { homeState, rooms, setHomeState, addRoom, replaceRooms, updateRoom, removeRoom, moveRoom, reorderRoom } = useCalculatorStore();
  const setPlan = useDesignStore((s) => s.setPlan);
  const [mode, setMode] = useState<PlanMode>('upload');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<number | null>(null);

  const canContinue = !!homeState && rooms.length > 0;

  useEffect(() => {
    if (canContinue && error) setError(null);
  }, [canContinue, error]);

  /** A typed room takes the first free spot on the plan, so it shows up on the layout at once. */
  const addPlaced = (room: Room) => {
    const spot = findFreeSpot(rooms, room.width, room.length);
    addRoom({ ...room, ...spot });
    setSelectedRoomId(room.id);
  };

  /** A drawn rectangle becomes a room of the most common type; name and type are edited in the list. */
  const addDrawn = (rect: DrawnRect) => {
    const type = 'living_room';
    const count = rooms.filter((r) => r.type === type).length + 1;
    const room = computeRoomAreas({
      id: nanoid(),
      type,
      nameKa: `${roomTypeLabel(t, type)} ${count}`,
      width: Number(rect.width.toFixed(2)),
      length: Number(rect.length.toFixed(2)),
      height: ROOM_TYPES[type].defaultHeight,
    });
    addRoom({ ...room, x: rect.x, z: rect.z });
    setSelectedRoomId(room.id);
  };

  /** Name and type edits keep the derived areas honest; a type change also re-checks "wet". */
  const editRoom = (id: string, updates: Partial<Room>) => {
    const current = rooms.find((r) => r.id === id);
    if (!current) return;
    const merged = { ...current, ...updates };
    const recomputed = computeRoomAreas({ id, type: merged.type, nameKa: merged.nameKa, width: merged.width, length: merged.length, height: merged.height });
    updateRoom(id, { ...recomputed, x: current.x, z: current.z });
  };

  /** A handle drag: new size and corner, areas recomputed, everything else kept. */
  const resizeRoom = (id: string, rect: DrawnRect) => {
    const current = rooms.find((r) => r.id === id);
    if (!current) return;
    const recomputed = computeRoomAreas({ id, type: current.type, nameKa: current.nameKa, width: Number(rect.width.toFixed(2)), length: Number(rect.length.toFixed(2)), height: current.height });
    updateRoom(id, { ...recomputed, x: rect.x, z: rect.z });
  };

  const handleStart = () => {
    if (rooms.length === 0) {
      setError(t.calculator.needRoomsFirst);
      document.getElementById('plan-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!homeState) {
      setError(t.calculator.needHomeStateFirst);
      document.getElementById('home-state-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    router.push('/calculator/materials');
  };

  const options: Array<{ id: PlanMode; icon: React.ReactNode; label: string; desc: string }> = [
    { id: 'upload', icon: <Upload className="h-5 w-5" />, label: t.calculator.optionUpload, desc: t.calculator.optionUploadDesc },
    { id: 'manual', icon: <Rows3 className="h-5 w-5" />, label: t.calculator.optionManual, desc: t.calculator.optionManualDesc },
    { id: 'draw', icon: <PenLine className="h-5 w-5" />, label: t.calculator.optionDraw, desc: t.calculator.optionDrawDesc },
  ];

  return (
    <>
      <StepIndicator current={1} />
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={5} title={t.calculator.title} subtitle={t.calculator.startSubtitle} />

        <section id="plan-section" className="mt-10 space-y-5">
          <SectionHead index="01" title={t.calculator.planTitle} subtitle={t.calculator.planSubtitle} />

          {/* The three ways in, side by side; the chosen one opens below. */}
          <div className="grid border-l border-t border-line sm:grid-cols-3" role="tablist">
            {options.map((o, i) => {
              const active = mode === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(o.id)}
                  className={cn('group flex items-start gap-4 border-b border-r border-line p-5 text-left transition-colors', active ? 'bg-ink text-white' : 'bg-bg-surface hover:bg-sand-light')}
                >
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center border', active ? 'border-white/20' : 'border-line text-ink-muted')}>{o.icon}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-xs font-semibold tabular-nums', active ? 'text-white/60' : 'text-ink-faint')}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="mt-0.5 block font-serif text-lg font-semibold leading-tight">{o.label}</span>
                    <span className={cn('mt-1 block text-sm leading-relaxed', active ? 'text-white/70' : 'text-ink-muted')}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {mode === 'upload' && (
            <div className="border border-line bg-bg-surface p-5">
              <p className="text-sm text-ink-muted">{t.calculator.uploadPlanHint}</p>
              <div className="mt-4">
                <PlanUploadCard
                  showSample
                  onPlan={(plan, imageUrl) => {
                    // A different plan is a different flat: rooms, products and furniture all start over.
                    const fromPlan = calculatorRoomsFromPlan(plan);
                    replaceRooms(fromPlan);
                    setPlan(plan, imageUrl);
                    setPlanNotice(fromPlan.length);
                    setSelectedRoomId(null);
                    document.getElementById('rooms-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                />
              </div>
              {planNotice != null && <p className="mt-3 text-sm font-medium text-success">{t.calculator.planRoomsApplied.replace('{n}', String(planNotice))}</p>}
            </div>
          )}

          {mode === 'manual' && <RoomForm onAdd={addPlaced} />}

          {(mode !== 'upload' || rooms.length > 0) && (
            <div id="rooms-list" className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div>
                <p className="eyebrow mb-2">{t.calculator.layoutTitle}</p>
                <RoomLayoutEditor rooms={rooms} selectedId={selectedRoomId} onSelect={setSelectedRoomId} onMove={moveRoom} onResize={resizeRoom} onDraw={mode === 'draw' ? addDrawn : undefined} />
              </div>
              <div className="lg:sticky lg:top-24 lg:self-start">
                <p className="eyebrow mb-2">{t.rooms.title}</p>
                <RoomList rooms={rooms} selectedId={selectedRoomId} onSelect={setSelectedRoomId} onUpdate={editRoom} onReorder={reorderRoom} onRemove={removeRoom} />
              </div>
            </div>
          )}
        </section>

        <section id="home-state-section" className="mt-14 space-y-5">
          <SectionHead index="02" title={t.homeState.title} subtitle={t.homeState.subtitle} />
          <HomeStateSelector value={homeState} onChange={setHomeState} />
        </section>
      </div>

      <StepNav next={{ label: t.calculator.startButton, onClick: handleStart }}>
        {error && (
          <p role="alert" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </StepNav>
    </>
  );
}
