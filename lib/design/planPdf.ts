'use client';

/**
 * A floor plan handed over as a PDF.
 *
 * Architects export PDFs, not PNGs, and asking people to screenshot their own plan is a bad
 * first step. The first page is rasterised here, in the browser, with pdf.js — at a size
 * that keeps a 10 cm wall several pixels wide — and handed on as an ordinary PNG `File`, so
 * everything downstream (the upload, the Claude reader, the CV parser) sees an image and
 * nothing else has to know PDFs exist. The worker is served from `/vendor` (see
 * `scripts/copy-pdf-worker.mjs`) because the CSP only allows workers from this origin.
 */

/** Longest edge of the rendered page, pixels. Plenty for the parser and the vision model. */
const RENDER_EDGE_PX = 2200;

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function rasterizePdfPlan(file: File): Promise<File> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = RENDER_EDGE_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-unavailable');
    // A plan is ink on paper: paint the paper first so transparent areas do not read as walls.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('pdf-render-failed');
    const name = file.name.replace(/\.pdf$/i, '') || 'plan';
    return new File([blob], `${name}.png`, { type: 'image/png' });
  } finally {
    await doc.destroy();
  }
}
