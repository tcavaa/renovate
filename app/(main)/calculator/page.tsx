'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { RoomForm } from '@/components/calculator/RoomForm';
import { RoomList } from '@/components/calculator/RoomList';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { calculatorRoomsFromPlan } from '@/lib/design/planGeometry';

export default function CalculatorStep1Page() {
  const router = useRouter();
  const t = useT();
  const { homeState, rooms, setHomeState, addRoom, removeRoom, setRooms } = useCalculatorStore();
  const setPlan = useDesignStore((s) => s.setPlan);
  const [error, setError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<number | null>(null);

  const canContinue = !!homeState && rooms.length > 0;

  useEffect(() => {
    if (canContinue && error) setError(null);
  }, [canContinue, error]);

  const handleStart = () => {
    if (!homeState) {
      setError(t.calculator.needHomeStateFirst);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (rooms.length === 0) {
      setError(t.calculator.needRoomsFirst);
      document.getElementById('rooms-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    router.push('/calculator/materials');
  };

  return (
    <>
      <StepIndicator current={1} />
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={5} title={t.calculator.title} subtitle={t.calculator.startSubtitle} />

        <section className="mt-10 space-y-5">
          <SectionHead index="01" title={t.homeState.title} subtitle={t.homeState.subtitle} />
          <HomeStateSelector value={homeState} onChange={setHomeState} />
        </section>

        <section id="rooms-section" className="mt-14 space-y-5">
          <SectionHead index="02" title={t.rooms.title} subtitle={t.rooms.subtitle} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              {/* A plan read here is the same plan the 3D step will build on later. */}
              <div className="border border-line bg-bg-surface p-5">
                <p className="eyebrow">{t.calculator.uploadPlanTitle}</p>
                <p className="mb-4 mt-1 text-sm text-ink-muted">{t.calculator.uploadPlanHint}</p>
                <PlanUploadCard
                  showSample
                  onPlan={(plan, imageUrl) => {
                    const fromPlan = calculatorRoomsFromPlan(plan);
                    setRooms(fromPlan);
                    setPlan(plan, imageUrl);
                    setPlanNotice(fromPlan.length);
                    document.getElementById('rooms-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                />
                {planNotice != null && <p className="mt-3 text-sm font-medium text-success">{t.calculator.planRoomsApplied.replace('{n}', String(planNotice))}</p>}
              </div>
              <div className="flex items-center gap-4">
                <span className="h-px flex-1 bg-line" />
                <p className="eyebrow">{t.calculator.orAddManually}</p>
                <span className="h-px flex-1 bg-line" />
              </div>
              <RoomForm onAdd={addRoom} />
            </div>
            <div id="rooms-list" className="lg:sticky lg:top-24 lg:self-start">
              <RoomList rooms={rooms} onRemove={removeRoom} />
            </div>
          </div>
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
