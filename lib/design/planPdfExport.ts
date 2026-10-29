/**
 * The 2D plan as a PDF, made in the browser and downloaded.
 *
 * The board already knows how to draw a plan — `components/plan/draw` is plain canvas over
 * plain data — so the page is that drawing, rendered at print resolution onto an offscreen
 * canvas and wrapped in a PDF. Nothing is re-implemented and nothing can drift: what comes
 * out is what the person was looking at, room names, dimensions and all.
 *
 * The file is written by hand rather than with a PDF library. A vector page would have been
 * nicer, but the room names are Georgian and the fourteen fonts every PDF reader has are
 * Latin-1 — a vector plan would have meant embedding and subsetting a TrueType font, which
 * is a great deal of machinery for one button. A JPEG goes into a PDF as it is
 * (`/DCTDecode`, no re-encoding), so the whole writer is the cross-reference table.
 *
 * Browser-only: it touches `document` and `canvas`.
 */

import type { ElectricalPoint, FloorPlan, PlacedItem } from './types';
import type { Transform } from '@/components/plan/draw';
import { drawPlanSheet } from '@/components/plan/sheet';
import type { LightingSheet } from '@/components/plan/lightingSheet';
import { isLight } from './electrical';

/** A4 at 72 points to the inch. */
const A4 = { short: 595.28, long: 841.89 };
const MARGIN_PT = 36;
/** Pixels per point on the offscreen canvas: 200 dpi is plenty for a floor plan. */
const SCALE = 200 / 72;

export interface PlanPdfOptions {
  /** The title block's heading — the project's name. */
  title: string;
  /** A line under the title: the flat, the date — whatever the page is about. */
  subtitle?: string;
  /** "Total area" and "N rooms", already in the reader's language. */
  areaLabel: string;
  roomsLabel: string;
  /** The unit areas are labelled with on the sheet. */
  unitM2: string;
  /** The unit lengths are labelled with — the dimension chains and the doors' sizes. */
  unitM?: string;
  items?: PlacedItem[];
  electrical?: ElectricalPoint[];
  /** Draw the furniture footprints too. */
  furniture?: boolean;
  /** What a piece of furniture is called on the sheet (its kind, in the reader's language). */
  itemLabel?: (item: PlacedItem) => string;
  /** Lines listed under the sheet — the design rules' warnings (`ruleNotes`), with their heading. */
  notes?: string[];
  notesTitle?: string;
  /** The lighting plan (`lightingSheet`): a second page — the plan with its lights alone and a table of every room's fittings. */
  lighting?: LightingSheet | null;
}

/** The lighting sheet's table: its rows' height and the share of the page the plan keeps above it. */
const TABLE_LINE_PT = 12.5;
const LIGHTING_PLAN_SHARE = 0.52;

/** At most this many notes are listed; the rest are counted. */
const MAX_NOTES = 10;
const NOTE_LINE_PT = 12;

/** Pixels of the board's own scale that the dimension chains take outside the walls, on each side. */
const DIMENSIONS_GAP = 24;

/** The plan as a PDF — a page, and the lighting sheet after it when there is one. Throws when the browser will not give up the canvas. */
export async function planPdfBlob(plan: FloorPlan, options: PlanPdfOptions): Promise<Blob> {
  const points = [...plan.rooms.flatMap((r) => r.polygon), ...(plan.walls ?? []).flatMap((w) => [w.a, w.b])];
  if (points.length === 0) throw new Error('empty-plan');
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const maxZ = Math.max(...points.map((p) => p.z));
  const box = { minX, maxX, minZ, maxZ };

  // The page follows the flat: a long thin plan gets a landscape sheet.
  const landscape = maxX - minX >= maxZ - minZ;
  const pageW = landscape ? A4.long : A4.short;
  const pageH = landscape ? A4.short : A4.long;
  const headerPt = 70;
  // The notes take a strip along the foot of the sheet: a heading and a line each.
  const notes = options.notes ?? [];
  const footerPt = notes.length > 0 ? 24 + (Math.min(notes.length, MAX_NOTES) + (notes.length > MAX_NOTES ? 1 : 0)) * NOTE_LINE_PT : 0;

  const pages: Array<{ jpeg: Uint8Array; pxW: number; pxH: number; pageW: number; pageH: number }> = [];
  {
    const { canvas, ctx } = page(pageW, pageH);
    const transform = frame(box, pageW, pageH, headerPt, footerPt);
    drawTitleBlock(ctx, options, pageW);
    // The sheet is an architect's (`components/plan/sheet`), at print size: every door and
    // window with its size, the room names over the furniture, the chains outside the walls.
    drawPlanSheet(ctx, transform, plan, {
      ui: SCALE,
      unitM2: options.unitM2,
      unitM: options.unitM ?? 'm',
      labels: 'full',
      dimensionsGap: DIMENSIONS_GAP,
      openingSizes: true,
      structure: true,
      electrical: options.electrical,
      furniture: options.furniture ? { items: options.items ?? [], label: (item) => options.itemLabel?.(item) ?? '' } : undefined,
    });
    if (notes.length > 0) drawNotes(ctx, notes, options.notesTitle ?? '', pageW, pageH, footerPt);
    pages.push({ jpeg: await canvasJpeg(canvas), pxW: canvas.width, pxH: canvas.height, pageW, pageH });
  }

  // The lighting sheet: the plan with its lights alone (and the lamps among the furniture), and
  // a table of every room's fittings under it.
  const lighting = options.lighting;
  if (lighting && lighting.rows.length > 0) {
    const { canvas, ctx } = page(pageW, pageH);
    const tablePt = Math.max(pageH * (1 - LIGHTING_PLAN_SHARE) - MARGIN_PT, 80);
    const transform = frame(box, pageW, pageH, headerPt, tablePt);
    drawTitleBlock(ctx, { ...options, title: `${lighting.title} · ${options.title}` }, pageW);
    drawPlanSheet(ctx, transform, plan, {
      ui: SCALE,
      unitM2: options.unitM2,
      unitM: options.unitM ?? 'm',
      labels: 'full',
      dimensionsGap: DIMENSIONS_GAP,
      openingSizes: false,
      structure: true,
      electrical: (options.electrical ?? []).filter((p) => isLight(p.kind)),
      furniture: { items: (options.items ?? []).filter((i) => i.slot === 'pendant' || i.slot === 'floor_lamp'), label: (item) => options.itemLabel?.(item) ?? '' },
    });
    drawTable(ctx, lighting, pageW, pageH, tablePt);
    pages.push({ jpeg: await canvasJpeg(canvas), pxW: canvas.width, pxH: canvas.height, pageW, pageH });
  }

  return pdfOfImages(pages);
}

/** A white page at print resolution. */
function page(pageW: number, pageH: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageW * SCALE);
  canvas.height = Math.round(pageH * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Metres → canvas pixels: the plan centred under the title block, with room for the dimension chains round it and `footerPt` kept below. */
function frame(box: { minX: number; maxX: number; minZ: number; maxZ: number }, pageW: number, pageH: number, headerPt: number, footerPt: number): Transform {
  // The chains of dimensions stand outside the walls: two rows of them below and to the
  // right, one above and to the left, all at print size.
  const dimPad = DIMENSIONS_GAP * SCALE * 3.2;
  const usableW = (pageW - MARGIN_PT * 2) * SCALE - dimPad * 2;
  const usableH = (pageH - MARGIN_PT * 2 - headerPt - footerPt) * SCALE - dimPad * 2;
  const scale = Math.min(usableW / Math.max(0.5, box.maxX - box.minX), usableH / Math.max(0.5, box.maxZ - box.minZ));
  return {
    scale,
    offsetX: MARGIN_PT * SCALE + dimPad + (usableW - (box.maxX - box.minX) * scale) / 2 - box.minX * scale,
    offsetY: (MARGIN_PT + headerPt) * SCALE + dimPad + (usableH - (box.maxZ - box.minZ) * scale) / 2 - box.minZ * scale,
  };
}

/** The lighting table in the strip at the foot of the page: a header row and a line a fitting, cut with "+ N" where it runs out. */
function drawTable(ctx: CanvasRenderingContext2D, sheet: LightingSheet, pageW: number, pageH: number, tablePt: number): void {
  const x = MARGIN_PT * SCALE;
  const width = (pageW - MARGIN_PT * 2) * SCALE;
  const shares = [0.22, 0.26, 0.18, 0.26, 0.08];
  const columns = shares.map((_, i) => x + shares.slice(0, i).reduce((a, b) => a + b, 0) * width);
  let y = (pageH - MARGIN_PT - tablePt + 16) * SCALE;
  const bottom = (pageH - MARGIN_PT) * SCALE;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = '#D8D2C8';
  ctx.lineWidth = Math.max(1, SCALE);
  ctx.beginPath();
  ctx.moveTo(x, y - 12 * SCALE);
  ctx.lineTo(x + width, y - 12 * SCALE);
  ctx.stroke();
  const fit = (text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut}…`;
  };
  const row = (cells: string[], weight: number, color: string) => {
    ctx.font = `${weight} ${Math.round(8.5 * SCALE)}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    cells.forEach((cell, i) => ctx.fillText(fit(cell, shares[i] * width - 6 * SCALE), columns[i], y));
  };
  row(sheet.header, 600, '#1E1F23');
  const room = sheet.rows.length;
  let shown = 0;
  for (const cells of sheet.rows) {
    if (y + TABLE_LINE_PT * SCALE * 2 > bottom) break;
    y += TABLE_LINE_PT * SCALE;
    row(cells, cells[0] ? 600 : 400, '#4A463F');
    shown += 1;
  }
  if (shown < room) {
    y += TABLE_LINE_PT * SCALE;
    row([`+ ${room - shown}`, '', '', '', ''], 400, '#6F6A63');
  }
  ctx.restore();
}

/** The notes along the foot of the sheet, each one line, cut with an ellipsis where it runs past the margin. */
function drawNotes(ctx: CanvasRenderingContext2D, notes: string[], title: string, pageW: number, pageH: number, footerPt: number): void {
  const x = MARGIN_PT * SCALE;
  const width = (pageW - MARGIN_PT * 2) * SCALE;
  let y = (pageH - MARGIN_PT - footerPt + 14) * SCALE;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = '#D8D2C8';
  ctx.lineWidth = Math.max(1, SCALE);
  ctx.beginPath();
  ctx.moveTo(x, y - 12 * SCALE);
  ctx.lineTo(x + width, y - 12 * SCALE);
  ctx.stroke();
  ctx.fillStyle = '#1E1F23';
  ctx.font = `600 ${Math.round(9.5 * SCALE)}px system-ui, sans-serif`;
  ctx.fillText(title, x, y);
  ctx.font = `400 ${Math.round(8.5 * SCALE)}px system-ui, sans-serif`;
  ctx.fillStyle = '#4A463F';
  const fit = (text: string) => {
    if (ctx.measureText(text).width <= width) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
    return `${cut}…`;
  };
  const shown = notes.slice(0, MAX_NOTES);
  for (const note of shown) {
    y += NOTE_LINE_PT * SCALE;
    ctx.fillText(fit(`• ${note}`), x, y);
  }
  if (notes.length > shown.length) {
    y += NOTE_LINE_PT * SCALE;
    ctx.fillText(`+ ${notes.length - shown.length}`, x, y);
  }
  ctx.restore();
}

/** Saves the plan to the person's downloads. */
export async function downloadPlanPdf(plan: FloorPlan, filename: string, options: PlanPdfOptions): Promise<void> {
  const blob = await planPdfBlob(plan, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: Safari has not finished with it when click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The title block: the heading large enough to be the first thing on the sheet, what the
 * sheet is about under it, and the flat's figures on the right of the same line.
 */
function drawTitleBlock(ctx: CanvasRenderingContext2D, options: PlanPdfOptions, pageW: number): void {
  const x = MARGIN_PT * SCALE;
  const right = (pageW - MARGIN_PT) * SCALE;
  ctx.save();
  ctx.fillStyle = '#1E1F23';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(24 * SCALE)}px system-ui, sans-serif`;
  ctx.fillText(options.title, x, Math.round(56 * SCALE));
  ctx.fillStyle = '#6F6A63';
  ctx.font = `400 ${Math.round(11 * SCALE)}px system-ui, sans-serif`;
  if (options.subtitle) ctx.fillText(options.subtitle, x, Math.round(76 * SCALE));
  ctx.textAlign = 'right';
  ctx.font = `600 ${Math.round(11 * SCALE)}px system-ui, sans-serif`;
  ctx.fillStyle = '#1E1F23';
  ctx.fillText(`${options.areaLabel} · ${options.roomsLabel}`, right, Math.round(76 * SCALE));
  ctx.strokeStyle = '#1E1F23';
  ctx.lineWidth = Math.max(1, 1.5 * SCALE);
  ctx.beginPath();
  ctx.moveTo(x, Math.round(88 * SCALE));
  ctx.lineTo(right, Math.round(88 * SCALE));
  ctx.stroke();
  ctx.restore();
}

/** The canvas as JPEG bytes. `toBlob` hands them over directly — nothing fetches a data URL. */
async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('no-image');
  return new Uint8Array(await blob.arrayBuffer());
}

/** One page, one image, filling it. Exported so the writer can be parsed back in a test. */
export function pdfOfImage(jpeg: Uint8Array, pxW: number, pxH: number, pageW: number, pageH: number): Blob {
  return pdfOfImages([{ jpeg, pxW, pxH, pageW, pageH }]);
}

/** A page per image, each filling its page. */
export function pdfOfImages(pages: Array<{ jpeg: Uint8Array; pxW: number; pxH: number; pageW: number; pageH: number }>): Blob {
  // 1 the catalogue, 2 the pages, then for each page: the page, its image, its content.
  const pageRef = (i: number) => 3 + i * 3;
  const objects: Array<string | { image: Uint8Array; pxW: number; pxH: number }> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageRef(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  pages.forEach((p, i) => {
    const content = `q ${p.pageW.toFixed(2)} 0 0 ${p.pageH.toFixed(2)} 0 0 cm /Im0 Do Q\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pageW.toFixed(2)} ${p.pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${pageRef(i) + 1} 0 R >> >> /Contents ${pageRef(i) + 2} 0 R >>`,
      // The image object is written in two halves with the JPEG between them.
      { image: p.jpeg, pxW: p.pxW, pxH: p.pxH },
      `<< /Length ${content.length} >>\nstream\n${content}endstream`
    );
  });

  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? latin1(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    if (typeof body !== 'string') {
      push(`<< /Type /XObject /Subtype /Image /Width ${body.pxW} /Height ${body.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${body.image.length} >>\nstream\n`);
      push(body.image);
      push('\nendstream');
    } else push(body);
    push('\nendobj\n');
  });

  const xref = length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) table += `${String(offset).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return new Blob([out], { type: 'application/pdf' });
}

/** PDF syntax is bytes, not text: every character here is one byte. */
function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}
