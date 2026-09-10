'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { AlertCircle, Check, Home, PenLine, Rows3, Sofa, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { RoomForm } from '@/components/calculator/RoomForm';
import { RoomList } from '@/components/calculator/RoomList';
import { RoomLayoutEditor, type DrawnRect } from '@/components/calculator/RoomLayoutEditor';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { findFreeSpot } from '@/lib/calculator/layout';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';

type PlanMode = 'upload' | 'manual' | 'draw';

/**
 * Step 1 of the studio: the plan it starts from — uploaded, typed room by room, or drawn on
 * the grid — and then what kind of project this is. Nothing leaves this page until the one
 * continue button at the bottom: an uploaded plan waits here, typed and drawn rooms wait
 * here, and the "what do you need" choice has to be made rather than assumed.
 */
export default function DesignStartPage() {
  const t = useT();
  const router = useRouter();
  const { mode, modeChosen, setMode, setPlan, homeState, setHomeState, startFromCalculator, setProjectId } = useDesignStore();
  const calculatorRooms = useCalculatorStore((s) => s.rooms);
  const [planMode, setPlanMode] = useState<PlanMode>('upload');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  /** A plan read from an upload (or borrowed from the calculator), waiting for "continue". */
  const [uploaded, setUploaded] = useState<{ plan: FloorPlan; imageUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planReady = planMode === 'upload' ? !!uploaded : rooms.length > 0;
  useEffect(() => {
    if (error && planReady && modeChosen) setError(null);
  }, [error, planReady, modeChosen]);

  const useCalculator = () => {
    const calc = useCalculatorStore.getState();
    if (calc.rooms.length === 0) return;
    // The calculation and this design are one project: carry its home state, picks and id.
    if (calc.homeState) {
      startFromCalculator({ rooms: calc.rooms, homeState: calc.homeState, selectedProducts: calc.selectedProducts, selectedFurniture: calc.selectedFurniture, projectId: calc.projectId });
      router.push('/design/plan');
      return;
    }
    setProjectId(calc.projectId);
    setUploaded({ plan: planFromCalculatorRooms(calc.rooms), imageUrl: null });
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

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /** The one way forward: a plan of some kind, and a decision about what it is for. */
  const continueToRooms = () => {
    if (!planReady) {
      setError(t.design.needPlanFirst);
      scrollTo('plan-section');
      return;
    }
    if (!modeChosen) {
      setError(t.design.needModeFirst);
      scrollTo('mode-section');
      return;
    }
    if (planMode === 'upload' && uploaded) setPlan(uploaded.plan, uploaded.imageUrl);
    else setPlan(planFromCalculatorRooms(rooms));
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

        <section id="plan-section" className="mt-10 space-y-5">
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
                showContinue={false}
                onPlan={(plan, imageUrl) => setUploaded({ plan, imageUrl })}
                onReset={() => setUploaded(null)}
              />
              {uploaded && (
                <p className="mt-4 flex items-center gap-2 text-sm font-medium text-success">
                  <Check className="h-4 w-4" />
                  {fill(t.design.planReady, { n: uploaded.plan.rooms.length })}
                </p>
              )}
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
          )}
        </section>

        <section id="mode-section" className="mt-14 space-y-5">
          <SectionHead index="02" title={t.design.modeTitle} subtitle={t.design.modeSubtitle} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard active={modeChosen && mode === 'design_only'} onClick={() => setMode('design_only')} icon={<Sofa className="h-5 w-5" />} label={t.design.modeDesignOnlyLabel} description={t.design.modeDesignOnlyDesc} />
            <ModeCard active={modeChosen && mode === 'full'} onClick={() => setMode('full')} icon={<Home className="h-5 w-5" />} label={t.design.modeFullLabel} description={t.design.modeFullDesc} />
          </div>
          {modeChosen && mode === 'full' && (
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

      <StepNav next={{ label: t.design.continueButton, onClick: continueToRooms }}>
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
