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
import { drawBeam, drawColumn, drawElectrical, drawFurniture, drawOpening, drawRoom, drawTechnical, drawWall, type Transform } from '@/components/plan/draw';

/** A4 at 72 points to the inch. */
const A4 = { short: 595.28, long: 841.89 };
const MARGIN_PT = 36;
/** Pixels per point on the offscreen canvas: 200 dpi is plenty for a floor plan. */
const SCALE = 200 / 72;

export interface PlanPdfOptions {
  /** The title block's heading — the project's name. */
  title: string;
  /** "Total area" and "N rooms", already in the reader's language. */
  areaLabel: string;
  roomsLabel: string;
  /** The unit areas are labelled with on the sheet. */
  unitM2: string;
  items?: PlacedItem[];
  electrical?: ElectricalPoint[];
  /** Draw the furniture footprints too. */
  furniture?: boolean;
}

/** The plan as a one-page PDF. Throws when the browser will not give up the canvas. */
export async function planPdfBlob(plan: FloorPlan, options: PlanPdfOptions): Promise<Blob> {
  const points = [...plan.rooms.flatMap((r) => r.polygon), ...(plan.walls ?? []).flatMap((w) => [w.a, w.b])];
  if (points.length === 0) throw new Error('empty-plan');
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const maxZ = Math.max(...points.map((p) => p.z));

  // The page follows the flat: a long thin plan gets a landscape sheet.
  const landscape = maxX - minX >= maxZ - minZ;
  const pageW = landscape ? A4.long : A4.short;
  const pageH = landscape ? A4.short : A4.long;
  const headerPt = 54;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageW * SCALE);
  canvas.height = Math.round(pageH * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Metres → canvas pixels, the plan centred under the title block.
  const usableW = (pageW - MARGIN_PT * 2) * SCALE;
  const usableH = (pageH - MARGIN_PT * 2 - headerPt) * SCALE;
  const scale = Math.min(usableW / Math.max(0.5, maxX - minX), usableH / Math.max(0.5, maxZ - minZ));
  const transform: Transform = {
    scale,
    offsetX: MARGIN_PT * SCALE + (usableW - (maxX - minX) * scale) / 2 - minX * scale,
    offsetY: (MARGIN_PT + headerPt) * SCALE + (usableH - (maxZ - minZ) * scale) / 2 - minZ * scale,
  };

  drawTitleBlock(ctx, options, pageW);

  for (const room of plan.rooms) {
    drawRoom(ctx, transform, room, { selected: false, hovered: false, labels: true, dimensions: true, unitM2: options.unitM2 });
  }
  for (const wall of plan.walls ?? []) drawWall(ctx, transform, wall, {});
  for (const room of plan.rooms) {
    for (const opening of room.openings) drawOpening(ctx, transform, room, opening, plan.wallThicknessM, {});
  }
  for (const column of plan.columns ?? []) drawColumn(ctx, transform, column, {});
  for (const beam of plan.beams ?? []) drawBeam(ctx, transform, beam, {});
  for (const point of plan.technical?.points ?? []) drawTechnical(ctx, transform, point, {});
  for (const point of options.electrical ?? []) drawElectrical(ctx, transform, point, {});
  if (options.furniture) {
    for (const item of options.items ?? []) drawFurniture(ctx, transform, item, '', {});
  }

  const jpeg = await canvasJpeg(canvas);
  return pdfOfImage(jpeg, canvas.width, canvas.height, pageW, pageH);
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

function drawTitleBlock(ctx: CanvasRenderingContext2D, options: PlanPdfOptions, pageW: number): void {
  const x = MARGIN_PT * SCALE;
  ctx.save();
  ctx.fillStyle = '#161513';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${Math.round(17 * SCALE)}px system-ui, sans-serif`;
  ctx.fillText(options.title, x, Math.round(48 * SCALE));
  ctx.fillStyle = '#6F6A63';
  ctx.font = `400 ${Math.round(10 * SCALE)}px system-ui, sans-serif`;
  ctx.fillText(`${options.areaLabel} · ${options.roomsLabel}`, x, Math.round(64 * SCALE));
  ctx.strokeStyle = '#E4DFD6';
  ctx.lineWidth = Math.max(1, SCALE);
  ctx.beginPath();
  ctx.moveTo(x, Math.round(74 * SCALE));
  ctx.lineTo((pageW - MARGIN_PT) * SCALE, Math.round(74 * SCALE));
  ctx.stroke();
  ctx.restore();
}

/** The canvas as JPEG bytes. `toBlob` hands them over directly — nothing fetches a data URL. */
async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('no-image');
  return new Uint8Array(await blob.arrayBuffer());
}

/** One page, one image, filling it. */
function pdfOfImage(jpeg: Uint8Array, pxW: number, pxH: number, pageW: number, pageH: number): Blob {
  const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im0 Do Q\n`;
  const objects: Array<string | Uint8Array> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    // The image object is written in two halves with the JPEG between them.
    jpeg,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ];

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
    if (body instanceof Uint8Array) {
      push(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${body.length} >>\nstream\n`);
      push(body);
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
