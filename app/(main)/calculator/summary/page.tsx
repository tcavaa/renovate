'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer,
  Save,
  CheckCircle2,
  RotateCcw,
  LogIn,
  UserPlus,
  Lock,
  ArrowRight,
  Box,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { SummaryCard } from '@/components/calculator/SummaryCard';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { useRateBook } from '@/hooks/useRateBook';
import { useT } from '@/lib/i18n/client';
import { homeStateLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

const CALLBACK_URL = '/calculator/summary?autoSave=1';

export default function SummaryPage() {
  const router = useRouter();
  const ka = useT();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const { rooms, homeState, selectedProducts, selectedFurniture, reset } =
    useCalculatorStore();
  const { book } = useRateBook();
  const startFromCalculator = useDesignStore((s) => s.startFromCalculator);

  /** Carries rooms, home state and every pick into the studio; style is the only step left. */
  const viewIn3d = () => {
    if (!homeState) return;
    startFromCalculator({ rooms, homeState, selectedProducts, selectedFurniture });
    router.push('/design/style');
  };
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSaveAttempted = useRef(false);
  const inFlightRef = useRef(false);

  const ready = !!homeState && rooms.length > 0;

  const summary = useMemo(() => {
    if (!ready) return null;
    const products = Object.values(selectedProducts);
    const furniture = Object.values(selectedFurniture).flat();
    return buildProjectSummary(rooms, homeState, products, furniture, book);
  }, [ready, rooms, homeState, selectedProducts, selectedFurniture, book]);

  const persistProject = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeState,
          rooms,
          nameKa: ka.calculator.projectName,
          selectedProducts,
          selectedFurniture,
        }),
      });
      const json = await res.json();
      if (res.ok && json.data?.id) {
        setSavedId(json.data.id);
        setSuccessModalOpen(true);
      } else {
        setError(json.error ?? ka.calculator.saveError);
      }
    } catch (e) {
      console.error(e);
      setError(ka.calculator.saveError);
    } finally {
      setSaving(false);
      inFlightRef.current = false;
    }
  }, [homeState, rooms, selectedProducts, selectedFurniture, ka]);

  const handleSave = () => {
    if (!ready) return;
    if (status === 'loading') return;
    if (saving || savedId != null) return;
    if (status !== 'authenticated') {
      setAuthModalOpen(true);
      return;
    }
    void persistProject();
  };

  const goToProfile = useCallback(() => {
    reset();
    router.push('/profile');
  }, [reset, router]);

  useEffect(() => {
    if (!successModalOpen) return;
    const t = setTimeout(() => {
      goToProfile();
    }, 2500);
    return () => clearTimeout(t);
  }, [successModalOpen, goToProfile]);

  useEffect(() => {
    if (autoSaveAttempted.current) return;
    if (!ready) return;
    if (status !== 'authenticated') return;
    if (searchParams?.get('autoSave') !== '1') return;
    autoSaveAttempted.current = true;
    void persistProject();
    router.replace('/calculator/summary');
  }, [ready, status, searchParams, persistProject, router]);

  if (!ready || !summary) {
    return (
      <>
        <StepIndicator current={5} />
        <EmptyStep message={ka.calculator.needRoomsFirst} back={ka.common.back} />
      </>
    );
  }

  const callbackParam = encodeURIComponent(CALLBACK_URL);

  return (
    <>
      <StepIndicator current={5} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={5}
          total={5}
          title={ka.summary.title}
          subtitle={ka.summary.subtitle}
          meta={
            <>
              <span>{rooms.length} × {ka.summary.rooms}</span>
              <span className="text-ink-faint">·</span>
              <span>{homeStateLabel(ka, homeState)}</span>
            </>
          }
          actions={
            <div className="no-print flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                {ka.summary.print}
              </Button>
              <Button variant="outline" onClick={viewIn3d} disabled={!ready}>
                <Box className="h-4 w-4" />
                {ka.calculator.view3dButton}
              </Button>
              <Button variant="ghost" onClick={() => reset()}>
                <RotateCcw className="h-4 w-4" />
                {ka.calculator.startOver}
              </Button>
            </div>
          }
        />

        <div className="mt-8">
          <SummaryCard summary={summary} />
        </div>

        {error && <p className="mt-6 border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>

      <StepNav
        back={{ href: '/calculator/furniture', label: ka.calculator.backButton }}
        next={
          savedId != null
            ? { href: '/profile', label: ka.calculator.savedAndGo, icon: <CheckCircle2 className="h-4 w-4" /> }
            : { label: ka.summary.saveProject, onClick: handleSave, disabled: saving || status === 'loading', loading: saving, icon: <Save className="h-4 w-4" /> }
        }
      >
        <p className="text-sm text-ink-muted sm:text-right">
          {ka.summary.grandTotalWithMargin} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(summary.grandTotalWithMargin)}</span>
        </p>
      </StepNav>

      <Dialog
        open={successModalOpen}
        onOpenChange={(open) => {
          if (!open) goToProfile();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <DialogTitle className="text-center">
              {ka.calculator.saved}
            </DialogTitle>
            <DialogDescription className="text-center">
              {ka.calculator.successDescTpl.replace('{id}', String(savedId ?? ''))}
            </DialogDescription>
          </DialogHeader>
          <Button onClick={goToProfile} size="lg" className="w-full">
            <ArrowRight className="h-4 w-4" />
            {ka.calculator.goToProjects}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-brand">
              <Lock className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">
              {ka.calculator.authModalTitle}
            </DialogTitle>
            <DialogDescription className="text-center">
              {ka.calculator.authModalDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <Link href={`/login?callbackUrl=${callbackParam}`}>
                <LogIn className="h-4 w-4" />
                {ka.nav.login}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/register?callbackUrl=${callbackParam}`}>
                <UserPlus className="h-4 w-4" />
                {ka.nav.register}
              </Link>
            </Button>
          </div>
          <p className="text-center text-xs text-ink-muted">
            {ka.calculator.authModalNote}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
