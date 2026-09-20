import { describe, expect, it } from 'vitest';
import { encode } from 'jpeg-js';
import { pdfOfImage } from '@/lib/design/planPdfExport';

/**
 * The PDF writer is written by hand (see `lib/design/planPdfExport`), and the part of a PDF
 * most easily got wrong by hand is the cross-reference table: every byte offset in it has to
 * land exactly on its object, or a reader opens a blank page and says nothing useful. So the
 * file is parsed back with pdf.js — the real thing, the same library the app reads uploaded
 * plans with — and asked for its page and what that page draws.
 */
describe('the plan PDF', () => {
  const W = 120;
  const H = 80;
  const image = (() => {
    const data = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = (i % W) * 2;
      data[i * 4 + 1] = 120;
      data[i * 4 + 2] = 200;
      data[i * 4 + 3] = 255;
    }
    return new Uint8Array(encode({ data, width: W, height: H }, 90).data);
  })();

  it('is a PDF a reader can open, one A4 page with the drawing on it', async () => {
    const bytes = new Uint8Array(await pdfOfImage(image, W, H, 841.89, 595.28).arrayBuffer());
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const [x0, y0, x1, y1] = page.getViewport({ scale: 1 }).viewBox;
    expect([x0, y0]).toEqual([0, 0]);
    expect(x1).toBeCloseTo(841.89, 2);
    expect(y1).toBeCloseTo(595.28, 2);
    const ops = await page.getOperatorList();
    expect(ops.fnArray).toContain(pdfjs.OPS.paintImageXObject);
  });

  it('points every cross-reference offset at its own object', async () => {
    const bytes = new Uint8Array(await pdfOfImage(image, W, H, 595.28, 841.89).arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    const startxref = Number(/startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf('startxref')))![1]);
    expect(text.startsWith('xref', startxref)).toBe(true);
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) \d{5} n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) => expect(text.startsWith(`${i + 1} 0 obj`, offset)).toBe(true));
  });
});
