'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, PenLine, Upload } from 'lucide-react';
import Image from 'next/image';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { PlanSketch } from '@/components/projects/PlanSketch';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { RoomsPanel } from '@/components/plan/RoomsPanel';
import { ElementInspector } from '@/components/plan/ElementInspector';
import { Button } from '@/components/ui/button';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorPlan } from '@/hooks/useCalculatorPlan';
import { useT } from '@/lib/i18n/client';
import { calculatorRoomsFromPlan } from '@/lib/design/planGeometry';
import { cn } from '@/lib/utils';

type PlanMode = 'upload' | 'draw';

/**
 * Step 1 of the calculator: the plan — uploaded, or drawn on the same board the studio uses
 * (walls as lines, rooms as rectangles, doors and windows) — and the home's condition. The
 * plan lives in the design store; the calculator's rooms are read off it after every edit,
 * so the same drawing carries into 3D untouched.
 */
export default function CalculatorStep1Page() {
  const router = useRouter();
  const t = useT();
  const { homeState, rooms, setHomeState, replaceRooms } = useCalculatorStore();
  const plan = useCalculatorPlan();
  const setPlan = useDesignStore((s) => s.setPlan);
  const floorPlanUrl = useDesignStore((s) => s.floorPlanUrl);
  const selection = useDesignStore((s) => s.selectedElement);
  const focusRoomId = useDesignStore((s) => s.focusRoomId);
  const electrical = useDesignStore((s) => s.electrical);
  const actions = useDesignStore();
  const [replacingPlan, setReplacingPlan] = useState(false);
  const planOnFile = !!plan && rooms.length > 0 && plan.rooms.length === rooms.length && plan.rooms.every((r) => rooms.some((room) => room.id === r.id));
  const [mode, setMode] = useState<PlanMode>(() => (plan && plan.rooms.length > 0 ? 'draw' : 'upload'));
  const [error, setError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<number | null>(null);

  const canContinue = !!homeState && rooms.length > 0;

  useEffect(() => {
    if (canContinue && error) setError(null);
  }, [canContinue, error]);

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

  /** A blank sheet to draw on: a new flat, a new project. */
  const startDrawing = () => {
    if (!plan || plan.rooms.length === 0) {
      setPlan({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] }, null);
      replaceRooms([]);
    }
    setMode('draw');
  };

  const options: Array<{ id: PlanMode; icon: React.ReactNode; label: string; desc: string; onPick: () => void }> = [
    { id: 'upload', icon: <Upload className="h-5 w-5" />, label: t.calculator.optionUpload, desc: t.calculator.optionUploadDesc, onPick: () => setMode('upload') },
    { id: 'draw', icon: <PenLine className="h-5 w-5" />, label: t.calculator.optionDraw, desc: t.build.optionScratchDesc, onPick: startDrawing },
  ];

  return (
    <>
      <StepIndicator current={1} />
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={5} title={t.calculator.title} subtitle={t.calculator.startSubtitle} />

        <section id="plan-section" className="mt-10 space-y-5">
          <SectionHead index="01" title={t.calculator.planTitle} subtitle={t.calculator.planSubtitle} />

          {/* The two ways in, side by side; the chosen one opens below. */}
          <div className="grid gap-3 sm:grid-cols-2" role="tablist">
            {options.map((o, i) => {
              const active = mode === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={o.onPick}
                  className={cn('group flex items-start gap-4 rounded-[16px] border p-5 text-left transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface hover:border-ink/40')}
                >
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border', active ? 'border-white/20' : 'border-line text-ink-muted')}>{o.icon}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-xs font-semibold tabular-nums', active ? 'text-white/60' : 'text-ink-faint')}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="mt-0.5 block font-serif text-lg font-semibold leading-tight">{o.label}</span>
                    <span className={cn('mt-1 block text-sm leading-relaxed', active ? 'text-white/70' : 'text-ink-muted')}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {mode === 'upload' && planOnFile && !replacingPlan && plan && (
            <div className="grid items-center gap-5 rounded-[16px] border border-line bg-bg-surface p-5 sm:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-[12px] border border-line bg-white p-2">
                {floorPlanUrl ? (
                  <Image src={floorPlanUrl} alt="" width={440} height={330} unoptimized className="h-auto max-h-44 w-full object-contain" />
                ) : (
                  <PlanSketch plan={plan} rooms={rooms} className="block h-auto w-full" />
                )}
              </div>
              <div>
                <p className="font-medium text-success">{t.calculator.planAlreadyUploaded.replace('{n}', String(rooms.length))}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.calculator.uploadPlanHint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setReplacingPlan(true)}>
                    {t.calculator.replacePlan}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMode('draw')}>
                    {t.calculator.optionDraw}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mode === 'upload' && (!planOnFile || replacingPlan) && (
            <div className="rounded-[16px] border border-line bg-bg-surface p-5">
              <p className="text-sm text-ink-muted">{t.calculator.uploadPlanHint}</p>
              <div className="mt-4">
                <PlanUploadCard
                  showSample
                  onPlan={(uploaded, imageUrl) => {
                    // A different plan is a different flat: rooms, products and furniture all start over.
                    const fromPlan = calculatorRoomsFromPlan(uploaded);
                    replaceRooms(fromPlan);
                    setPlan(uploaded, imageUrl);
                    setPlanNotice(fromPlan.length);
                    setReplacingPlan(false);
                    setMode('draw');
                    document.getElementById('rooms-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                />
              </div>
              {planNotice != null && <p className="mt-3 text-sm font-medium text-success">{t.calculator.planRoomsApplied.replace('{n}', String(planNotice))}</p>}
            </div>
          )}

          {mode === 'draw' && plan && (
            <div id="rooms-list" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <PlanWorkspace tools={['select', 'pan', 'wall', 'room', 'door', 'window']} layerKeys={['walls', 'openings', 'dimensions']} height={560} />
              </div>
              <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                <ElementInspector
                  plan={plan}
                  electrical={electrical}
                  selection={selection && selection.kind !== 'room' ? selection : null}
                  actions={{
                    updateWall: actions.updateWall,
                    removeWall: actions.removeWall,
                    updateOpening: actions.updateOpening,
                    removeOpening: actions.removeOpening,
                    addOpening: (roomId, kind, wallIndex) => {
                      const id = actions.addOpening(roomId, kind, wallIndex);
                      if (id) actions.selectElement({ kind: 'opening', id, roomId });
                    },
                    updateColumn: actions.updateColumn,
                    removeColumn: actions.removeColumn,
                    updateBeam: actions.updateBeam,
                    removeBeam: actions.removeBeam,
                    updateTechnical: actions.updateTechnicalPoint,
                    removeTechnical: actions.removeTechnicalPoint,
                    updateElectrical: actions.updateElectricalPoint,
                    removeElectrical: actions.removeElectricalPoint,
                    updateRoom: actions.updateRoom,
                    resizeRoom: actions.resizeRoom,
                    removeRoom: actions.removeRoom,
                  }}
                />
                <RoomsPanel
                  plan={plan}
                  selectedId={focusRoomId}
                  onSelect={(id) => {
                    actions.setFocusRoom(id);
                    actions.selectElement(id ? { kind: 'room', id } : null);
                  }}
                  actions={{ updateRoom: actions.updateRoom, resizeRoom: actions.resizeRoom, removeRoom: actions.removeRoom }}
                  onAddRectangle={(rect, type) => {
                    const id = actions.addRectangleRoom(rect, type);
                    if (id) actions.setFocusRoom(id);
                  }}
                />
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
