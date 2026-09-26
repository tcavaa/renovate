'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileDown, Printer, Save, ShoppingBag } from 'lucide-react';
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
import { useProjectId, useProjectMeta } from '@/components/projects/ProjectGate';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { designEntryHref } from '@/lib/design/steps';
import { useRateBook } from '@/hooks/useRateBook';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { platformFee } from '@/lib/finance/money';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import { priceScene } from '@/lib/design/pricing';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';
import { problemOf, useSaveProblems } from '@/lib/flow/saveQueue';
import { boardFinishesFromPicks } from '@/lib/calculator/roomFinishes';
import { downloadPlanPdf } from '@/lib/design/planPdfExport';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { useLocale, useT } from '@/lib/i18n/client';
import { homeStateLabel } from '@/lib/i18n/labels';
import { formatGEL, formatM2 } from '@/lib/utils';
import type { DesignScene } from '@/lib/design/types';

export default function SummaryPage() {
  const router = useRouter();
  const ka = useT();
  const locale = useLocale();
  const projectId = useProjectId();
  const { snapshot, status: projectStatus, setStatus, name: projectName } = useProjectMeta();

  const { rooms, homeState, selectedProducts, selectedFurniture, excluded, quantities, choices, toggleExcluded, setLinesExcluded, setQuantity, clearEdits } =
    useCalculatorStore();
  // The calculator's own board, each room in the floor and walls chosen for it — the plan the PDF draws.
  const boardPlan = useCalculatorPlanStore((s) => s.plan);
  const [exporting, setExporting] = useState(false);
  const { book } = useRateBook();
  const fees = usePlatformFees();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  /**
   * The project's 3D design, when it has one that was laid out. The calculator does not open
   * the studio's store (`ProjectGate`), so what this page knows of the design — whether the 3D
   * button opens it or makes it, and the design's half of the order — is read off the project's
   * row as the steps were opened; nothing on these steps changes that half.
   */
  const designExists = snapshot.hasDesign && !snapshot.designPending && (snapshot.plan?.rooms.length ?? 0) > 0;

  /**
   * Into 3D. The design's entry carries rooms, home state, every pick and the drawing board
   * across (`handOffToDesign`): a project that already has a design opens it with the picks
   * applied; otherwise the style is the only step left before the studio.
   */
  const viewIn3d = () => {
    if (!homeState) return;
    router.push(designEntryHref(projectId, 'calculator'));
  };

  const ready = !!homeState && rooms.length > 0;

  const summary = useMemo(() => {
    if (!ready) return null;
    const products = Object.values(selectedProducts);
    const furniture = Object.values(selectedFurniture).flat();
    return buildProjectSummary(rooms, homeState, products, furniture, book, { choices });
  }, [ready, rooms, homeState, selectedProducts, selectedFurniture, book, choices]);

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

  // The design half is the design's budget — its product lines, the doors, fittings and
  // radiators with the furniture — priced the way the server will price it once this page
  // has saved: the calculator's save writes its own home state into the shared row and
  // makes the design a renovation (`mode: 'full'`), and the order is priced from that row.
  // The ticks and the quantities set on the design's budget hold here too: this dialogue
  // lists the same order.
  const designPlan = snapshot.plan;
  const designScene = snapshot.scene;
  const designPart = useMemo(() => {
    if (!designExists || !designPlan || !designScene || !homeState) return null;
    const scene: DesignScene = {
      styleId: designScene.styleId,
      mode: 'full',
      budgetGel: null,
      items: designScene.items,
      finishes: designScene.finishes,
      electrical: designScene.electrical ?? [],
      excluded: designScene.excluded,
      quantities: designScene.quantities,
    };
    return designCheckoutPart(designPlan, priceScene(designPlan, scene, { homeState, locale }), fees.designFeePerM2, locale);
  }, [designExists, designPlan, designScene, homeState, fees.designFeePerM2, locale]);
  // Built from the picks rather than from the estimate, because the two differ: what the
  // person ticked off on the order list is still costed and no longer bought.
  const checkoutParts: CheckoutPart[] = summary
    ? [calculatorCheckoutPart(rooms, selectedProducts, selectedFurniture, fees.calculatorFeePerM2, locale, edits), ...(designPart ? [designPart] : [])]
    : [];

  /**
   * Writes the calculation into the project's row — the save button and the checkout share
   * it. An explicit save, so a project the autosave has only ever written as a draft becomes a
   * saved one; the row exists already (it was made on the hub), so every press writes it again.
   */
  const saveNow = useCallback(async (): Promise<number> => {
    const { id } = await saveCalculatorProject({ draft: false });
    if (projectStatus === 'draft') setStatus('saved');
    return id;
  }, [projectStatus, setStatus]);

  const persistProject = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveNow();
      setSuccessModalOpen(true);
    } catch (e) {
      console.error(e);
      setError(ka.calculator.saveError);
      // A conflict or a product that is gone has its own way out, on the project's banner.
      useSaveProblems.getState().report('calculator', projectId, problemOf(e));
    } finally {
      setSaving(false);
      inFlightRef.current = false;
    }
  }, [saveNow, ka, projectId]);

  /** The plan as a PDF: the rooms with their sizes, the doors and windows with theirs, what each room wears. */
  const exportPdf = async () => {
    if (!boardPlan || boardPlan.rooms.length === 0 || !homeState) return;
    setExporting(true);
    setError(null);
    try {
      // The project's own name, now that every project has one.
      const title = projectName || ka.calculator.projectName;
      await downloadPlanPdf(boardPlan, `${title}-${new Date().toISOString().slice(0, 10)}`, {
        title,
        subtitle: `${homeStateLabel(ka, homeState)} · ${new Date().toLocaleDateString('ka-GE')}`,
        areaLabel: formatM2(totalFloorAreaM2(boardPlan)),
        roomsLabel: fill(ka.build.roomCount, { n: boardPlan.rooms.length }),
        unitM2: ka.units.m2,
        unitM: ka.units.m,
        finishes: boardFinishesFromPicks(boardPlan, selectedProducts),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = () => {
    if (!ready || saving) return;
    void persistProject();
  };

  // Saved: on to the project's page. Nothing here is emptied — the project stays as it is,
  // and reopens on this step.
  const goToProject = useCallback(() => {
    router.push(`/profile/projects/${projectId}`);
  }, [router, projectId]);

  useEffect(() => {
    if (!successModalOpen) return;
    const t = setTimeout(() => {
      goToProject();
    }, 2500);
    return () => clearTimeout(t);
  }, [successModalOpen, goToProject]);

  if (!ready || !summary || !sheet) {
    return (
      <>
        <StepIndicator current={6} />
        <EmptyStep message={ka.calculator.needRoomsFirst} back={ka.common.back} href={calculatorStepHref(projectId, homeState ? 2 : 1)} />
      </>
    );
  }

  return (
    <>
      <StepIndicator current={6} />
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
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {ka.summary.saveProject}
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
        back={{ href: calculatorStepHref(projectId, 5), label: ka.calculator.backButton }}
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

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} saveProject={saveNow} projectId={projectId} parts={checkoutParts} onOrdered={() => setStatus('submitted')} />

      <Dialog
        open={successModalOpen}
        onOpenChange={(open) => {
          if (!open) goToProject();
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
              {ka.calculator.successDescTpl.replace('{id}', String(projectId))}
            </DialogDescription>
          </DialogHeader>
          <Button onClick={goToProject} size="lg" className="w-full">
            <ArrowRight className="h-4 w-4" />
            {ka.calculator.goToProjects}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
