/**
 * The plan as an architect's sheet: white rooms, solid black walls, the doors and windows in
 * them, the room labels and the flat's sizes chained outside the walls. The PDF export draws
 * its page with it (`lib/design/planPdfExport`) and the project cards their picture
 * (`components/projects/PlanDrawing`), so the two cannot drift apart. Plain canvas, no React.
 */

import { primaryHalf } from '@/lib/design/openings';
import type { ElectricalPoint, FloorPlan, PlacedItem } from '@/lib/design/types';
import { drawBeam, drawColumn, drawElectrical, drawFurniture, drawOpening, drawOpeningSize, drawOuterDimensions, drawRoom, drawRoomLabel, drawTechnical, drawWall, outerDimensionChains, wallEndExtensions, type Transform } from './draw';

export interface PlanSheetOptions {
  /** Multiplies every pixel size (strokes, type, gaps) — the PDF renders at print resolution. */
  ui?: number;
  /** The unit areas are labelled with. */
  unitM2: string;
  /** The unit lengths are labelled with — the dimension chains and the doors' sizes. */
  unitM: string;
  /** Room labels: name and area, the area alone, or none. */
  labels?: 'full' | 'area' | 'none';
  /** Pixels (before `ui`) between the walls and the first dimension chain; null leaves the chains off. */
  dimensionsGap?: number | null;
  /** Every door and window with its size written outside the wall. */
  openingSizes?: boolean;
  /** Columns, beams and the technical points. */
  structure?: boolean;
  electrical?: ElectricalPoint[];
  /** Furniture footprints, with what each is called. */
  furniture?: { items: PlacedItem[]; label: (item: PlacedItem) => string };
}

/** How far the dimension chains reach outside the walls on each side, in pixels: one chain above and left, two below and right. */
export function sheetMargins(gap: number, ui = 1): { top: number; left: number; bottom: number; right: number } {
  const plate = 8 * ui;
  return { top: gap * ui + plate, left: gap * ui + plate, bottom: gap * 2 * ui + plate, right: gap * 2 * ui + plate };
}

export function drawPlanSheet(ctx: CanvasRenderingContext2D, t: Transform, plan: FloorPlan, options: PlanSheetOptions): void {
  const ui = options.ui ?? 1;
  // No floor is tinted in its finish and no wall carries a band of one along its face —
  // those read as lines inside the walls on paper. The edge lengths inside the rooms are left
  // off too: the chains outside the walls carry every size.
  for (const room of plan.rooms) drawRoom(ctx, t, room, { selected: false, hovered: false, labels: false, dimensions: false, unitM2: options.unitM2 });
  // Walls with their corners closed, like the board, and solid: no hatch line down the middle.
  // Room separators first, dashed, so the walls they end against are drawn over their ends.
  const extensions = wallEndExtensions(plan.walls ?? []);
  const walls = [...(plan.walls ?? []).filter((w) => w.separator), ...(plan.walls ?? []).filter((w) => !w.separator)];
  for (const wall of walls) drawWall(ctx, t, wall, { extendA: extensions.get(wall.id)?.a, extendB: extensions.get(wall.id)?.b, solid: true });
  for (const room of plan.rooms) {
    for (const opening of room.openings) {
      drawOpening(ctx, t, room, opening, plan.wallThicknessM, {});
      // An interior door's size once, on the half that draws the leaf, not on each of its two
      // halves — and a window onto a balcony's once, on the half that stands for both.
      if (options.openingSizes && opening.kind !== 'archway' && primaryHalf(opening)) drawOpeningSize(ctx, t, room, opening, plan.wallThicknessM, options.unitM, { ui });
    }
  }
  if (options.structure) {
    for (const column of plan.columns ?? []) drawColumn(ctx, t, column, {});
    for (const beam of plan.beams ?? []) drawBeam(ctx, t, beam, {});
    for (const point of plan.technical?.points ?? []) drawTechnical(ctx, t, point, {});
  }
  for (const point of options.electrical ?? []) drawElectrical(ctx, t, point, {});
  if (options.furniture) for (const item of options.furniture.items) drawFurniture(ctx, t, item, options.furniture.label(item), { ui });
  // The room labels over everything, on a white plate.
  const labels = options.labels ?? 'full';
  if (labels !== 'none') for (const room of plan.rooms) drawRoomLabel(ctx, t, room, { unitM2: options.unitM2, ui, halo: true, areaOnly: labels === 'area' });
  if (options.dimensionsGap != null) {
    const chains = outerDimensionChains(plan);
    if (chains) drawOuterDimensions(ctx, t, chains, options.unitM, { gap: options.dimensionsGap, ui });
  }
}
