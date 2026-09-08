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
  ShoppingBag,
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
import { Button3d } from '@/components/ui/button-3d';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { useRateBook } from '@/hooks/useRateBook';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { platformFee } from '@/lib/finance/money';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { designCheckoutPart } from '@/lib/projects/checkoutParts';
import { useLocale, useT } from '@/lib/i18n/client';
import { homeStateLabel, localizedName } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

const CALLBACK_URL = '/calculator/summary?autoSave=1';

export default function SummaryPage() {
  const router = useRouter();
  const ka = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const { rooms, homeState, selectedProducts, selectedFurniture, reset, projectId } =
    useCalculatorStore();
  const { book } = useRateBook();
  const fees = usePlatformFees();
  const startFromCalculator = useDesignStore((s) => s.startFromCalculator);
  const designProjectId = useDesignStore((s) => s.projectId);
  const designHasItems = useDesignStore((s) => s.items.length > 0 && s.plan != null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSaveAttempted = useRef(false);
  const inFlightRef = useRef(false);

  /**
   * Carries rooms, home state, every pick and the saved project into the studio. A project
   * that already has a design opens it with the picks applied; otherwise style is the only
   * step left.
   */
  const currentProjectId = savedId ?? projectId;
  const designExists = designHasItems && currentProjectId != null && designProjectId === currentProjectId;
  const viewIn3d = () => {
    if (!homeState) return;
    const landing = startFromCalculator({ rooms, homeState, selectedProducts, selectedFurniture, projectId: currentProjectId });
    router.push(landing === 'studio' ? '/design/studio' : '/design/style');
  };

  const ready = !!homeState && rooms.length > 0;

  const summary = useMemo(() => {
    if (!ready) return null;
    const products = Object.values(selectedProducts);
    const furniture = Object.values(selectedFurniture).flat();
    return buildProjectSummary(rooms, homeState, products, furniture, book);
  }, [ready, rooms, homeState, selectedProducts, selectedFurniture, book]);

  // The platform's own line: a fee per square metre of the flat, shown, not collected.
  const totalM2 = useMemo(() => rooms.reduce((s, r) => s + r.floorM2, 0), [rooms]);
  const fee = platformFee(totalM2, fees.calculatorFeePerM2);

  const designPart = useDesignStore((s) => (designExists ? designCheckoutPart(s.plan, s.items, s.finishes, fees.designFeePerM2, locale) : null));
  const checkoutParts: CheckoutPart[] = summary
    ? [
        {
          kind: 'calculator',
          totalM2,
          feePerM2: fees.calculatorFeePerM2,
          lines: [...summary.products, ...summary.furniture].map((p, i) => ({ key: `${p.productId}-${i}`, productId: p.productId, name: localizedName(locale, p), qty: p.qty, total: p.totalPrice, where: null })),
        },
        ...(designPart ? [designPart] : []),
      ]
    : [];

  /** Writes the project once and returns its id — the save button and the checkout share it. */
  const saveOnce = useCallback(async (): Promise<number> => {
    if (savedId != null) return savedId;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homeState,
        rooms,
        nameKa: ka.calculator.projectName,
        selectedProducts,
        selectedFurniture,
        // A project opened from the profile, or one this session already saved, is written
        // into rather than duplicated. Read at call time: it is an id, not something to re-render on.
        projectId: useCalculatorStore.getState().projectId ?? undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.data?.id) throw new Error(json.error ?? 'save-failed');
    setSavedId(json.data.id);
    useCalculatorStore.getState().setProjectId(json.data.id);
    return json.data.id as number;
  }, [savedId, homeState, rooms, selectedProducts, selectedFurniture, ka]);

  const persistProject = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveOnce();
      setSuccessModalOpen(true);
    } catch (e) {
      console.error(e);
      setError(ka.calculator.saveError);
    } finally {
      setSaving(false);
      inFlightRef.current = false;
    }
  }, [saveOnce, ka]);

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
              {savedId != null ? (
                <Button asChild variant="outline">
                  <Link href="/profile">
                    <CheckCircle2 className="h-4 w-4" />
                    {ka.calculator.savedAndGo}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={handleSave} disabled={saving || status === 'loading'}>
                  <Save className="h-4 w-4" />
                  {ka.summary.saveProject}
                </Button>
              )}
              <Button variant="ghost" onClick={() => reset()}>
                <RotateCcw className="h-4 w-4" />
                {ka.calculator.startOver}
              </Button>
            </div>
          }
        />

        <div className="mt-8">
          <SummaryCard summary={summary} platformFee={{ perM2: fees.calculatorFeePerM2, m2: totalM2, total: fee }} />
        </div>

        {error && <p className="mt-6 border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>

      <StepNav
        back={{ href: '/calculator/furniture', label: ka.calculator.backButton }}
        next={{ label: ka.market.checkout, onClick: () => setCheckoutOpen(true), disabled: saving, icon: <ShoppingBag className="h-4 w-4" /> }}
      >
        <div className="flex flex-wrap items-center justify-end gap-4">
          <p className="text-sm text-ink-muted">
            {ka.market.totalWithFee} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(summary.grandTotalWithMargin + fee)}</span>
          </p>
          <Button3d onClick={viewIn3d} disabled={!ready}>
            {designExists ? ka.profile.openIn3d : ka.calculator.view3dButton}
          </Button3d>
        </div>
      </StepNav>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} saveProject={saveOnce} projectId={currentProjectId} parts={checkoutParts} />

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
