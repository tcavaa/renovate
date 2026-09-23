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
  FileDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { SummaryCard } from '@/components/calculator/SummaryCard';
import { BudgetSheet, type SheetActions } from '@/components/budget/BudgetSheet';
import { calculatorSheet } from '@/lib/summary/calculatorSheet';
import { usePickStores } from '@/hooks/usePickStores';
import { fill } from '@/lib/admin/list';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { Button3d } from '@/components/ui/button-3d';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { resetFlow } from '@/lib/flow/reset';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { useRateBook } from '@/hooks/useRateBook';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { platformFee } from '@/lib/finance/money';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import { priceScene } from '@/lib/design/pricing';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';
import { finishAreasByProduct } from '@/lib/calculator/placement';
import { downloadPlanPdf } from '@/lib/design/planPdfExport';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { useLocale, useT } from '@/lib/i18n/client';
import { homeStateLabel } from '@/lib/i18n/labels';
import { formatGEL, formatM2 } from '@/lib/utils';

const CALLBACK_URL = '/calculator/summary?autoSave=1';

export default function SummaryPage() {
  const router = useRouter();
  const ka = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const { rooms, homeState, selectedProducts, selectedFurniture, reset, projectId, excluded, quantities, toggleExcluded, setLinesExcluded, setQuantity, clearEdits, syncFinishAreas } =
    useCalculatorStore();
  // The calculator's own board: what was laid on it is what the cart's finishes are bought at.
  const boardPlan = useCalculatorPlanStore((s) => s.plan);
  const boardFinishes = useCalculatorPlanStore((s) => s.finishes);
  useEffect(() => {
    syncFinishAreas(finishAreasByProduct(boardFinishes));
  }, [boardFinishes, syncFinishAreas]);
  const [exporting, setExporting] = useState(false);
  const { book } = useRateBook();
  const fees = usePlatformFees();
  const startFromCalculator = useDesignStore((s) => s.startFromCalculator);
  const designProjectId = useDesignStore((s) => s.projectId);
  const designHasItems = useDesignStore((s) => s.items.length > 0 && s.plan != null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

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
    // The drawing the calculator was working on crosses into the studio here and nowhere
    // else — the two boards are separate until the person asks for this.
    const board = useCalculatorPlanStore.getState();
    const landing = startFromCalculator({ rooms, homeState, selectedProducts, selectedFurniture, projectId: currentProjectId, plan: board.plan, floorPlanUrl: board.floorPlanUrl, finishes: board.finishes });
    router.push(landing === 'studio' ? '/design/studio' : '/design/style');
  };

  const ready = !!homeState && rooms.length > 0;

  const summary = useMemo(() => {
    if (!ready) return null;
    const products = Object.values(selectedProducts);
    const furniture = Object.values(selectedFurniture).flat();
    return buildProjectSummary(rooms, homeState, products, furniture, book);
  }, [ready, rooms, homeState, selectedProducts, selectedFurniture, book]);

  // The estimate as one sheet: every line with its tick and its quantity, the picks under the
  // shop that sells them. The engine's figures are the original; the person's edits — lines
  // ticked off, quantities of their own — are laid over them and kept in the store.
  const pickIds = useMemo(() => [...Object.values(selectedProducts), ...Object.values(selectedFurniture).flat()].map((p) => p.productId), [selectedProducts, selectedFurniture]);
  const storeOf = usePickStores(pickIds);
  const edits = useMemo(() => ({ excluded, quantities }), [excluded, quantities]);
  const sheet = useMemo(
    () => (summary ? calculatorSheet(summary, { selectedProducts, selectedFurniture }, { rooms, edits, storeOf }) : null),
    [summary, selectedProducts, selectedFurniture, rooms, edits, storeOf]
  );
  const sheetActions: SheetActions = {
    toggle: (line) => line.tick && toggleExcluded(line.tick),
    setMany: (lines, out) => setLinesExcluded(lines.flatMap((l) => (l.tick ? [l.tick] : [])), out),
    setQuantity: (line, qty) => line.tick && setQuantity(line.tick, qty, line.originalQty ?? line.qty),
  };

  // The platform's own line: a fee per square metre of the flat, shown, not collected.
  const totalM2 = useMemo(() => rooms.reduce((s, r) => s + r.floorM2, 0), [rooms]);
  const fee = platformFee(totalM2, fees.calculatorFeePerM2);

  // Select the slices, not a derived object: a selector that builds a new object every call
  // is a new snapshot every render, and useSyncExternalStore loops on that.
  const designPlan = useDesignStore((s) => s.plan);
  const designStyleId = useDesignStore((s) => s.styleId);
  const designItems = useDesignStore((s) => s.items);
  const designFinishes = useDesignStore((s) => s.finishes);
  const designElectrical = useDesignStore((s) => s.electrical);
  // The ticks made on the design's budget hold here too: this dialogue lists the same order.
  const designExcluded = useDesignStore((s) => s.excluded);
  // The design half is the design's budget — its product lines, the doors, fittings and
  // radiators with the furniture — priced the way the server will price it once this page
  // has saved: the calculator's save writes its own home state into the shared row and
  // makes the design a renovation (`mode: 'full'`), and the order is priced from that row.
  const designPart = useMemo(() => {
    if (!designExists || !designPlan || !homeState) return null;
    const scene = { styleId: designStyleId, mode: 'full' as const, budgetGel: null, items: designItems, finishes: designFinishes, electrical: designElectrical, excluded: designExcluded };
    return designCheckoutPart(designPlan, priceScene(designPlan, scene, { homeState, locale }), fees.designFeePerM2, locale);
  }, [designExists, designPlan, designStyleId, designItems, designFinishes, designElectrical, designExcluded, homeState, fees.designFeePerM2, locale]);
  // Built from the picks rather than from the estimate, because the two differ: what the
  // person ticked off on the order list is still costed and no longer bought.
  const checkoutParts: CheckoutPart[] = summary
    ? [calculatorCheckoutPart(rooms, selectedProducts, selectedFurniture, fees.calculatorFeePerM2, locale, edits), ...(designPart ? [designPart] : [])]
    : [];

  /**
   * Writes the project once and returns its id — the save button and the checkout share it.
   * An explicit save, so a draft the autosave left behind becomes a saved project.
   */
  const saveOnce = useCallback(async (): Promise<number> => {
    if (savedId != null) return savedId;
    const id = await saveCalculatorProject({ draft: false, nameKa: ka.calculator.projectName });
    setSavedId(id);
    return id;
  }, [savedId, ka]);

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

  /** The plan as a PDF: the rooms with their sizes, the doors and windows with theirs, what each room wears. */
  const exportPdf = async () => {
    if (!boardPlan || boardPlan.rooms.length === 0 || !homeState) return;
    setExporting(true);
    setError(null);
    try {
      await downloadPlanPdf(boardPlan, `${ka.calculator.projectName}-${new Date().toISOString().slice(0, 10)}`, {
        title: ka.calculator.projectName,
        subtitle: `${homeStateLabel(ka, homeState)} · ${new Date().toLocaleDateString('ka-GE')}`,
        areaLabel: formatM2(totalFloorAreaM2(boardPlan)),
        roomsLabel: fill(ka.build.roomCount, { n: boardPlan.rooms.length }),
        unitM2: ka.units.m2,
        unitM: ka.units.m,
        finishes: boardFinishes,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

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

  /**
   * "Start over" empties the calculator — its rooms and picks, and the plan on its own
   * drawing board — and returns to the first step; the studio's work is the studio's and
   * stays (`resetFlow`). Unless the project was saved with the button just now, it asks
   * first: an autosaved draft is not something the person chose to keep, and the rooms and
   * picks are gone for good.
   */
  const startOver = useCallback(() => {
    setResetOpen(false);
    resetFlow('calculator');
    router.push('/calculator');
  }, [router]);
  const askStartOver = () => {
    if (savedId != null) startOver();
    else setResetOpen(true);
  };

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

  if (!ready || !summary || !sheet) {
    return (
      <>
        <StepIndicator current={7} />
        <EmptyStep message={ka.calculator.needRoomsFirst} back={ka.common.back} />
      </>
    );
  }

  const callbackParam = encodeURIComponent(CALLBACK_URL);

  return (
    <>
      <StepIndicator current={7} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={7}
          total={CALCULATOR_STEPS}
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
              {boardPlan && boardPlan.rooms.length > 0 && (
                <Button variant="outline" onClick={exportPdf} disabled={exporting}>
                  <FileDown className="h-4 w-4" />
                  {ka.build.exportPlanPdf}
                </Button>
              )}
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
              <Button variant="ghost" onClick={askStartOver}>
                <RotateCcw className="h-4 w-4" />
                {ka.calculator.startOver}
              </Button>
            </div>
          }
        />

        <div className="mt-8">
          <SummaryCard
            totals={sheet}
            original={sheet.original}
            platformFee={{ perM2: fees.calculatorFeePerM2, m2: totalM2, total: fee }}
            onResetEdits={clearEdits}
            note={
              <>
                {ka.build.sheetHint}
                <span className="mx-1.5 text-ink-faint">·</span>
                {sheet.excludedCount === 0 && sheet.changedCount === 0 ? ka.build.editsNone : fill(ka.build.editsCount, { out: sheet.excludedCount, changed: sheet.changedCount })}
              </>
            }
          >
            <BudgetSheet lines={sheet.lines} actions={sheetActions} />
          </SummaryCard>
        </div>

        {error && <p className="mt-6 border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>

      <StepNav
        back={{ href: '/calculator/furniture', label: ka.calculator.backButton }}
        next={{ label: ka.market.checkout, onClick: () => setCheckoutOpen(true), disabled: saving, icon: <ShoppingBag className="h-4 w-4" /> }}
      >
        <div className="flex flex-wrap items-center justify-end gap-4">
          <p className="text-sm text-ink-muted">
            {ka.market.totalWithFee} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(sheet.grandTotalWithMargin + fee)}</span>
          </p>
          <Button3d onClick={viewIn3d} disabled={!ready}>
            {designExists ? ka.profile.openIn3d : ka.calculator.view3dButton}
          </Button3d>
        </div>
      </StepNav>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} saveProject={saveOnce} projectId={currentProjectId} parts={checkoutParts} />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
              <RotateCcw className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">{ka.calculator.resetTitle}</DialogTitle>
            <DialogDescription className="text-center">{ka.calculator.resetDesc}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              {ka.common.cancel}
            </Button>
            <Button variant="ink" onClick={startOver}>
              <RotateCcw className="h-4 w-4" />
              {ka.calculator.resetConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
