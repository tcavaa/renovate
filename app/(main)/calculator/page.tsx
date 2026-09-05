'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { RoomForm } from '@/components/calculator/RoomForm';
import { RoomList } from '@/components/calculator/RoomList';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { calculatorRoomsFromPlan } from '@/lib/design/planGeometry';

export default function CalculatorStep1Page() {
  const router = useRouter();
  const ka = useT();
  const { homeState, rooms, setHomeState, addRoom, removeRoom, setRooms } =
    useCalculatorStore();
  const setPlan = useDesignStore((s) => s.setPlan);
  const [error, setError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<number | null>(null);

  const canContinue = !!homeState && rooms.length > 0;

  useEffect(() => {
    if (canContinue && error) setError(null);
  }, [canContinue, error]);

  const handleStart = () => {
    if (!homeState) {
      setError(ka.calculator.needHomeStateFirst);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (rooms.length === 0) {
      setError(ka.calculator.needRoomsFirst);
      const el = document.getElementById('rooms-section');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    router.push('/calculator/materials');
  };

  return (
    <>
      <StepIndicator current={1} />
      <div className="container py-10">
        <div className="mx-auto max-w-4xl space-y-10">
          <div className="text-center">
            <h1 className="font-serif text-3xl font-bold md:text-4xl">
              {ka.calculator.title}
            </h1>
            <p className="mt-2 text-ink-muted">
              {ka.calculator.startSubtitle}
            </p>
          </div>

          <section>
            <h2 className="mb-2 font-serif text-xl font-semibold">
              {ka.homeState.title}
            </h2>
            <p className="mb-5 text-sm text-ink-muted">{ka.homeState.subtitle}</p>
            <HomeStateSelector value={homeState} onChange={setHomeState} />
          </section>

          <section id="rooms-section" className="space-y-6">
            <div>
              <h2 className="mb-2 font-serif text-xl font-semibold">
                {ka.rooms.title}
              </h2>
              <p className="text-sm text-ink-muted">{ka.rooms.subtitle}</p>
            </div>
            {/* A plan read here is the same plan the 3D step will build on later. */}
            <div className="rounded-lg border border-line bg-bg-surface p-5">
              <h3 className="font-serif text-base font-semibold">{ka.calculator.uploadPlanTitle}</h3>
              <p className="mb-4 mt-1 text-sm text-ink-muted">{ka.calculator.uploadPlanHint}</p>
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
              {planNotice != null && (
                <p className="mt-3 text-sm font-medium text-success">
                  {ka.calculator.planRoomsApplied.replace('{n}', String(planNotice))}
                </p>
              )}
            </div>
            <p className="text-sm font-medium text-ink-muted">{ka.calculator.orAddManually}</p>
            <RoomForm onAdd={addRoom} />
            <div id="rooms-list">
              <RoomList rooms={rooms} onRemove={removeRoom} />
            </div>
          </section>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <div className="sticky bottom-4 flex justify-end">
            <Button
              type="button"
              onClick={handleStart}
              size="xl"
              className="shadow-cardHover"
            >
              {ka.calculator.startButton}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
