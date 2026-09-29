'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { Download, Eye, FileImage, Loader2, Minus, Moon, Plus, Scan, SquareDashed, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { ALL_LAYERS, PlanEditor, type EditorLayers, type PlanEditorApi } from '@/components/plan/PlanEditor';
import { PlanViewControls } from '@/components/plan/PlanToolbar';
import type { ViewerApi } from '@/components/design/Viewer3D';
import type { DesignScene, ElectricalPoint, FloorPlan, SurfaceFinish } from '@/lib/design/types';
import { DAYLIGHT_HOURS, DAYLIGHT_PRESETS, type DaylightPreset } from '@/lib/design3d/daylight';
import { downloadPlanPdf } from '@/lib/design/planPdfExport';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { archetypeLabel } from '@/lib/design/catalog';
import { useLocale, useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn, formatM2 } from '@/lib/utils';

// Three.js stays out of the server render and out of every page that does not show a flat.
const Viewer3D = dynamic(() => import('@/components/design/Viewer3D').then((m) => m.Viewer3D), { ssr: false, loading: () => <Loading /> });

type View = '2d' | '3d' | 'walk';

const PRESET_ICONS: Record<DaylightPreset, LucideIcon> = { morning: Sunrise, noon: Sun, evening: Sunset, night: Moon };
const NO_SELECTION = null;
const noop = () => undefined;

/**
 * A flat to look at and not to touch — what a brigade sees of the project it is hired for: the
 * 2D plan with every size, door and window, the electrical and plumbing points, the furniture
 * and the finishes (layers to switch, zoom, the plan as a PDF to print for the site), and, when
 * the project has a design, the furnished flat in 3D and walked through from the inside.
 *
 * The board is `PlanEditor` with `readOnly` and no edit callbacks: every drag slides the view,
 * nothing is hovered, picked or moved. The 3D view is `Viewer3D` with `readOnly`: the camera
 * turns and walks, nothing in the flat answers the pointer.
 */
export function ProjectViewer({
  plan,
  scene,
  finishes,
  electrical: fittings,
  title,
  subtitle,
  floorPlanUrl,
}: {
  /** The design's plan, or the calculator's board when the project has no design. */
  plan: FloorPlan | null;
  /** The design's scene; without one there is no 3D. */
  scene: DesignScene | null;
  /** What the rooms wear on the 2D plan and the PDF (the scene's, or the calculator's board). */
  finishes: SurfaceFinish[];
  /** The sockets, switches and lights: the scene's, or the calculator's board's when there is no design. */
  electrical?: ElectricalPoint[] | null;
  title: string;
  subtitle: string;
  /** The picture the plan was read from, when one was uploaded. */
  floorPlanUrl: string | null;
}) {
  const t = useT();
  const v = t.projectView;
  const locale = useLocale();
  const has3d = plan != null && scene != null;
  const [view, setView] = useState<View>(has3d ? '3d' : '2d');
  // White paper, like every plan: the finishes are a layer to switch on, not the floor.
  const [layers, setLayers] = useState<EditorLayers>({ ...ALL_LAYERS, furniture: has3d, origins: false, zones: false });
  const [planApi, setPlanApi] = useState<PlanEditorApi | null>(null);
  const [viewerApi, setViewerApi] = useState<ViewerApi | null>(null);
  const [showWalls, setShowWalls] = useState(true);
  const [daylight, setDaylight] = useState<DaylightPreset>('noon');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One plan for the life of the page: the board and the camera frame it once, not on every render.
  const [frameKey] = useState(() => Symbol('plan'));
  const items = useMemo(() => scene?.items ?? [], [scene]);
  const electrical = useMemo(() => fittings ?? scene?.electrical ?? [], [fittings, scene]);

  const exportPdf = useCallback(async () => {
    if (!plan) return;
    setExporting(true);
    setError(null);
    try {
      await downloadPlanPdf(plan, `${title}-${new Date().toISOString().slice(0, 10)}`, {
        title,
        subtitle,
        areaLabel: formatM2(totalFloorAreaM2(plan)),
        roomsLabel: fill(t.build.roomCount, { n: plan.rooms.length }),
        unitM2: t.units.m2,
        unitM: t.units.m,
        items,
        electrical,
        furniture: has3d,
        itemLabel: (item) => archetypeLabel(item.kind, locale),
      });
    } catch {
      setError(v.pdfError);
    } finally {
      setExporting(false);
    }
  }, [plan, title, subtitle, t, items, electrical, has3d, locale, v.pdfError]);

  if (!plan || plan.rooms.length === 0) {
    return <p className="border border-dashed border-line p-10 text-center text-sm text-ink-muted">{v.noPlan}</p>;
  }

  const tabs: Array<{ id: View; label: string; disabled?: boolean }> = [
    { id: '2d', label: v.tab2d },
    { id: '3d', label: v.tab3d, disabled: !has3d },
    { id: 'walk', label: t.design.walkthrough, disabled: !has3d },
  ];
  const presetLabel: Record<DaylightPreset, string> = { morning: t.design.daylightMorning, noon: t.design.daylightNoon, evening: t.design.daylightEvening, night: t.design.daylightNight };

  return (
    <section className="border border-line bg-bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-line p-0.5" role="tablist" aria-label={v.viewerTitle}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                disabled={tab.disabled}
                title={tab.disabled ? v.no3d : tab.label}
                onClick={() => setView(tab.id)}
                className={cn('flex h-8 items-center gap-1.5 px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40', view === tab.id ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}
              >
                {tab.id === 'walk' && <Eye className="h-3.5 w-3.5" />}
                {tab.label}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 border border-line px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            <Eye className="h-3 w-3" />
            {v.viewOnly}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== '2d' && (
            <>
              <button type="button" onClick={() => setShowWalls((w) => !w)} disabled={view === 'walk'} aria-pressed={showWalls} title={t.design.showWalls} aria-label={t.design.showWalls} className={cn('grid h-8 w-8 place-items-center border transition-colors disabled:opacity-40', showWalls ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft hover:text-ink')}>
                <SquareDashed className="h-4 w-4" />
              </button>
              <div className="flex border border-line p-0.5" role="radiogroup" aria-label={t.design.daylight}>
                {DAYLIGHT_PRESETS.map((preset) => {
                  const Icon = PRESET_ICONS[preset];
                  return (
                    <button key={preset} type="button" role="radio" aria-checked={daylight === preset} title={presetLabel[preset]} aria-label={presetLabel[preset]} onClick={() => setDaylight(preset)} className={cn('grid h-7 w-7 place-items-center transition-colors', daylight === preset ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {floorPlanUrl && (
            <a href={floorPlanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 border border-line px-3 text-sm text-ink-soft hover:border-ink hover:text-ink">
              <FileImage className="h-4 w-4" />
              {v.originalPlan}
            </a>
          )}
          <button type="button" onClick={exportPdf} disabled={exporting} className="inline-flex h-8 items-center gap-1.5 border border-ink bg-ink px-3 text-sm font-medium text-white hover:bg-brand disabled:opacity-60">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t.build.exportPlanPdf}
          </button>
        </div>
      </header>

      <div className="relative h-[70vh] min-h-[420px] bg-white">
        {view === '2d' ? (
          <>
            <PlanEditor
              plan={plan}
              items={layers.furniture ? items : []}
              electrical={electrical}
              finishes={finishes}
              tool="select"
              wallThicknessM={plan.wallThicknessM ?? 0.12}
              layers={layers}
              locked
              readOnly
              selection={NO_SELECTION}
              onSelect={noop}
              fitKey={frameKey}
              onApi={setPlanApi}
              className="h-full w-full"
            />
            <PlanViewControls
              layers={layers}
              onLayers={setLayers}
              layerKeys={['furniture', 'electrical', 'technical', 'zones', 'dimensions', 'labels']}
              onFit={planApi ? () => planApi.fit() : undefined}
              onZoom={planApi ? (factor) => planApi.zoom(factor) : undefined}
              vertical
              className="absolute bottom-3 right-3"
            />
          </>
        ) : (
          <>
            <Viewer3D plan={plan} scene={scene!} electrical={electrical} showWalls={view === 'walk' ? true : showWalls} viewMode={view === 'walk' ? 'walk' : 'orbit'} daylightHour={DAYLIGHT_HOURS[daylight]} readOnly frameKey={frameKey} onApi={setViewerApi} className="h-full w-full" />
            {view === '3d' && (
              <div className="absolute bottom-3 right-3 flex flex-col border border-line bg-white/90 p-1 backdrop-blur">
                <IconAction label={t.design.zoomIn} onClick={() => viewerApi?.zoom(0.8)} disabled={!viewerApi}>
                  <Plus className="h-4 w-4" />
                </IconAction>
                <IconAction label={t.design.zoomOut} onClick={() => viewerApi?.zoom(1.25)} disabled={!viewerApi}>
                  <Minus className="h-4 w-4" />
                </IconAction>
                <IconAction label={t.design.fitView} onClick={() => viewerApi?.reset()} disabled={!viewerApi}>
                  <Scan className="h-4 w-4" />
                </IconAction>
              </div>
            )}
            {view === 'walk' && <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 bg-ink/80 px-3 py-1.5 text-xs text-white">{t.design.walkHint}</p>}
          </>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-ink-muted">
        <span>{v.viewerHint}</span>
        {error && <span className="text-danger">{error}</span>}
      </footer>
    </section>
  );
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="grid h-8 w-8 place-items-center text-ink-soft transition-colors hover:text-ink disabled:opacity-40">
      {children}
    </button>
  );
}

function Loading() {
  const t = useT();
  return (
    <div className="grid h-full w-full place-items-center text-sm text-ink-muted">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.projectView.loading3d}
      </span>
    </div>
  );
}
