'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { nanoid } from 'nanoid';
import { ArrowUpRight, Check, Home, PenLine, Rows3, Sofa, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { RoomForm } from '@/components/calculator/RoomForm';
import { RoomList } from '@/components/calculator/RoomList';
import { RoomLayoutEditor, type DrawnRect } from '@/components/calculator/RoomLayoutEditor';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { findFreeSpot } from '@/lib/calculator/layout';
import type { Room } from '@/lib/calculator/types';

type PlanMode = 'upload' | 'manual' | 'draw';

/**
 * Step 1 of the studio: what kind of project, and the plan it starts from — uploaded, typed
 * room by room, or drawn on the grid. Typed and drawn rooms live here until the user
 * continues; then they become the plan the rest of the journey builds on.
 */
export default function DesignStartPage() {
  const t = useT();
  const router = useRouter();
  const { mode, setMode, setPlan, homeState, setHomeState } = useDesignStore();
  const calculatorRooms = useCalculatorStore((s) => s.rooms);
  const [planMode, setPlanMode] = useState<PlanMode>('upload');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const useCalculator = () => {
    if (calculatorRooms.length === 0) return;
    setPlan(planFromCalculatorRooms(calculatorRooms));
    router.push('/design/plan');
  };

  const addPlaced = (room: Room) => {
    setRooms((rs) => [...rs, { ...room, ...findFreeSpot(rs, room.width, room.length) }]);
    setSelectedRoomId(room.id);
  };
  const addDrawn = (rect: DrawnRect) => {
    const type = 'living_room';
    const count = rooms.filter((r) => r.type === type).length + 1;
    const room = computeRoomAreas({ id: nanoid(), type, nameKa: `${roomTypeLabel(t, type)} ${count}`, width: Number(rect.width.toFixed(2)), length: Number(rect.length.toFixed(2)), height: ROOM_TYPES[type].defaultHeight });
    setRooms((rs) => [...rs, { ...room, x: rect.x, z: rect.z }]);
    setSelectedRoomId(room.id);
  };
  const editRoom = (id: string, updates: Partial<Room>) =>
    setRooms((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const m = { ...r, ...updates };
        return { ...computeRoomAreas({ id, type: m.type, nameKa: m.nameKa, width: m.width, length: m.length, height: m.height }), x: r.x, z: r.z };
      })
    );
  const resizeRoom = (id: string, rect: DrawnRect) =>
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...computeRoomAreas({ id, type: r.type, nameKa: r.nameKa, width: Number(rect.width.toFixed(2)), length: Number(rect.length.toFixed(2)), height: r.height }), x: rect.x, z: rect.z } : r)));
  const moveRoom = (id: string, x: number, z: number) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, x, z } : r)));
  const reorderRoom = (id: string, direction: -1 | 1) =>
    setRooms((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const continueWithRooms = () => {
    if (rooms.length === 0) return;
    setPlan(planFromCalculatorRooms(rooms));
    router.push('/design/plan');
  };

  const options: Array<{ id: PlanMode; icon: React.ReactNode; label: string; desc: string }> = [
    { id: 'upload', icon: <Upload className="h-5 w-5" />, label: t.calculator.optionUpload, desc: t.calculator.optionUploadDesc },
    { id: 'manual', icon: <Rows3 className="h-5 w-5" />, label: t.calculator.optionManual, desc: t.calculator.optionManualDesc },
    { id: 'draw', icon: <PenLine className="h-5 w-5" />, label: t.calculator.optionDraw, desc: t.calculator.optionDrawDesc },
  ];

  return (
    <>
      <DesignSteps current={1} />
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={5} title={t.design.title} subtitle={t.design.subtitle} />

        <section className="mt-10 space-y-5">
          <SectionHead index="01" title={t.design.uploadTitle} subtitle={t.calculator.planSubtitle} aside={<span className="text-xs">{t.design.uploadFormats}</span>} />
          <div className="grid border-l border-t border-line sm:grid-cols-3" role="tablist">
            {options.map((o, i) => {
              const active = planMode === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPlanMode(o.id)}
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

          {planMode === 'upload' && (
            <div className="border border-line bg-bg-surface p-5 md:p-6">
              <PlanUploadCard
                showSample
                onPlan={(plan, imageUrl) => {
                  setPlan(plan, imageUrl);
                  router.push('/design/plan');
                }}
              />
              {calculatorRooms.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <p className="text-sm text-ink-muted">{t.design.noPlanDesc}</p>
                  <Button type="button" variant="outline" size="sm" onClick={useCalculator}>
                    {t.design.useCalculatorRooms} ({calculatorRooms.length})
                  </Button>
                </div>
              )}
            </div>
          )}

          {planMode === 'manual' && <RoomForm onAdd={addPlaced} />}

          {planMode !== 'upload' && (
            <>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <div>
                  <p className="eyebrow mb-2">{t.calculator.layoutTitle}</p>
                  <RoomLayoutEditor rooms={rooms} selectedId={selectedRoomId} onSelect={setSelectedRoomId} onMove={moveRoom} onResize={resizeRoom} onDraw={planMode === 'draw' ? addDrawn : undefined} />
                </div>
                <div className="lg:sticky lg:top-24 lg:self-start">
                  <p className="eyebrow mb-2">{t.rooms.title}</p>
                  <RoomList rooms={rooms} selectedId={selectedRoomId} onSelect={setSelectedRoomId} onUpdate={editRoom} onReorder={reorderRoom} onRemove={(id) => setRooms((rs) => rs.filter((r) => r.id !== id))} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="ink" size="lg" className="group" onClick={continueWithRooms} disabled={rooms.length === 0}>
                  {t.design.continueWithRooms}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="mt-14 space-y-5">
          <SectionHead index="02" title={t.design.modeTitle} subtitle={t.design.modeSubtitle} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard active={mode === 'design_only'} onClick={() => setMode('design_only')} icon={<Sofa className="h-5 w-5" />} label={t.design.modeDesignOnlyLabel} description={t.design.modeDesignOnlyDesc} />
            <ModeCard active={mode === 'full'} onClick={() => setMode('full')} icon={<Home className="h-5 w-5" />} label={t.design.modeFullLabel} description={t.design.modeFullDesc} />
          </div>
          {mode === 'full' && (
            <div className="space-y-3 pt-2">
              <div>
                <p className="eyebrow">{t.homeState.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.homeState.subtitle}</p>
              </div>
              <HomeStateSelector value={homeState} onChange={setHomeState} />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ModeCard({ active, onClick, icon, label, description }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('group flex items-start gap-4 border p-4 text-left transition-colors duration-300', active ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface hover:border-ink/40')}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center border', active ? 'border-white/20 text-white' : 'border-line text-ink-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-lg font-semibold leading-tight">{label}</span>
        <span className={cn('mt-1 block text-sm leading-relaxed', active ? 'text-white/70' : 'text-ink-muted')}>{description}</span>
      </span>
      <span className={cn('grid h-5 w-5 shrink-0 place-items-center border', active ? 'border-white bg-white text-ink' : 'border-line text-transparent group-hover:border-ink/40')}>
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}
