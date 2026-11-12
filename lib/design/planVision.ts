/**
 * Server-side preparation of a plan image for the Claude reader: the image the model sees and
 * the ink the geometry is checked against. Node only (sharp) — the parse route and the
 * `plan:ai` tool share it.
 *
 * Two copies of one drawing come out of it:
 *
 *   - **for the model**, the image within what the vision API accepts, with a coordinate ruler
 *     drawn on: dashed lines at every tenth, numbered along the top and left. A model asked for
 *     a fraction of an image estimates it; one given a ruler reads it off, and its doors land
 *     where the drawing has them rather than a metre along the wall.
 *   - **for the geometry**, the same image without the ruler as a greyscale raster turned into
 *     ink (`planInk`), so walls and gaps are measured on what was actually drawn.
 *
 * Both are in the same normalised frame (the ruler's 0..1 spans the drawing, not its margin),
 * so a coordinate the model reads off the ruler is a coordinate on the ink.
 */

import sharp from 'sharp';
import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE_PX, type AiPlanReading } from './aiPlan';
import { inkFromGray, type InkImage } from './planInk';
import { rulerLabel } from './rulerDigits';
import type { ImageMime } from '@/lib/uploads/sniff';

export interface VisionInput {
  /** What the model is sent. */
  image: { base64: string; mediaType: ImageMime };
  /** Whether that image carries the ruler (it does unless drawing it failed). */
  ruler: boolean;
  /** The drawing's ink, or null when the image could not be decoded. */
  ink: InkImage | null;
  /** A small copy without the ruler, for the check that it is a plan at all (`planCheck`). */
  glance: { base64: string; mediaType: ImageMime } | null;
}

/**
 * A picture whose longest side is under this is enlarged to it before anything reads it: a
 * 227 × 420 px copy off a messenger has its ruler's numbers running into each other, text the
 * model cannot make out and walls two pixels thick.
 */
const MIN_IMAGE_EDGE_PX = 1100;
/** …but never by more than this: past it there is nothing in the picture to enlarge. */
const MAX_ENLARGE = 5;

/** The glance's longest side, px: enough to tell a plan from a photo, at a fraction of the tokens. */
const GLANCE_PX = 512;

/** Margin around the drawing that holds the ruler's numbers, px. */
const RULER_MARGIN = 30;
/** The narrow margin on the other two sides, so the last line is not on the image's edge. */
const RULER_TAIL = 10;

export async function prepareForVision(bytes: Buffer, mediaType: ImageMime): Promise<VisionInput> {
  const sized = await fitForVision(bytes, mediaType);
  const [ink, ruled, glance] = await Promise.all([inkOf(sized.bytes), withRuler(sized.bytes), glanceOf(sized.bytes)]);
  return {
    image: ruled ? { base64: ruled.toString('base64'), mediaType: 'image/png' } : { base64: sized.bytes.toString('base64'), mediaType: sized.mediaType },
    ruler: !!ruled,
    ink,
    glance: glance ? { base64: glance.toString('base64'), mediaType: 'image/jpeg' } : null,
  };
}

async function glanceOf(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes).resize({ width: GLANCE_PX, height: GLANCE_PX, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
  } catch {
    return null;
  }
}

/**
 * Brings a plan image within what the vision API accepts and what it can use.
 *
 * The API refuses images over 5 MB and downsamples anything past ~1568 px on its longest
 * edge anyway, so a 12 MB scan straight off a phone is both a hard error and a waste of
 * upload time. Line drawings survive a resize well; a plan is re-encoded as PNG so the walls
 * stay crisp, a photo as JPEG. A small picture is enlarged (`MIN_IMAGE_EDGE_PX`). Anything
 * sharp cannot decode is sent as it came.
 */
export async function fitForVision(bytes: Buffer, mediaType: ImageMime): Promise<{ bytes: Buffer; mediaType: ImageMime }> {
  try {
    const meta = await sharp(bytes).metadata();
    // Room for the ruler's margin inside the edge the API keeps.
    const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
    const limit = MAX_IMAGE_EDGE_PX - RULER_MARGIN - RULER_TAIL;
    if (edge > 0 && edge < MIN_IMAGE_EDGE_PX) {
      const k = Math.min(MAX_ENLARGE, MIN_IMAGE_EDGE_PX / edge);
      const out = await sharp(bytes)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize({ width: Math.round((meta.width ?? 0) * k), height: Math.round((meta.height ?? 0) * k), fit: 'fill', kernel: 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toBuffer();
      return { bytes: out, mediaType: 'image/png' };
    }
    if (bytes.byteLength <= MAX_IMAGE_BYTES && edge <= limit && !meta.orientation) return { bytes, mediaType };
    const resize = { width: limit, height: limit, fit: 'inside' as const, withoutEnlargement: true };
    const photo = mediaType === 'image/jpeg';
    const out = photo
      ? await sharp(bytes).rotate().resize(resize).jpeg({ quality: 88 }).toBuffer()
      : await sharp(bytes).rotate().resize(resize).png({ compressionLevel: 9 }).toBuffer();
    if (out.byteLength > MAX_IMAGE_BYTES) {
      // Still too big as PNG (a scanned page, say): JPEG it.
      const jpeg = await sharp(bytes).rotate().resize(resize).jpeg({ quality: 82 }).toBuffer();
      return { bytes: jpeg, mediaType: 'image/jpeg' };
    }
    return { bytes: out, mediaType: photo ? 'image/jpeg' : 'image/png' };
  } catch {
    return { bytes, mediaType };
  }
}

/** The drawing as ink: transparency flattened onto paper white, then greyscale. */
async function inkOf(bytes: Buffer): Promise<InkImage | null> {
  try {
    const { data, info } = await sharp(bytes).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    return inkFromGray(new Uint8Array(data.buffer, data.byteOffset, info.width * info.height), info.width, info.height);
  } catch {
    return null;
  }
}

/**
 * The drawing with the ruler: a white margin, a dashed blue line at every tenth of the drawing
 * (solid at 0, 0.5 and 1) and the numbers in the margin. Null when it cannot be drawn — the
 * model is then told it has no ruler.
 */
async function withRuler(bytes: Buffer): Promise<Buffer | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) return null;
    const W = w + RULER_MARGIN + RULER_TAIL;
    const H = h + RULER_MARGIN + RULER_TAIL;
    const lines: string[] = [];
    for (let k = 0; k <= 10; k++) {
      const major = k % 5 === 0;
      const style = major ? 'stroke-opacity="0.55"' : 'stroke-opacity="0.4" stroke-dasharray="5 5"';
      const x = RULER_MARGIN + (k / 10) * w;
      const y = RULER_MARGIN + (k / 10) * h;
      const label = (k / 10).toFixed(1);
      lines.push(`<line x1="${x}" y1="${RULER_MARGIN - 6}" x2="${x}" y2="${RULER_MARGIN + h}" stroke="#1d4ed8" stroke-width="1" ${style}/>`);
      lines.push(`<line x1="${RULER_MARGIN - 6}" y1="${y}" x2="${RULER_MARGIN + w}" y2="${y}" stroke="#1d4ed8" stroke-width="1" ${style}/>`);
      // Drawn as strokes, not <text>: a server without fonts (a Vercel function) drew no numbers (`rulerDigits.ts`).
      lines.push(rulerLabel(label, x, RULER_MARGIN - 10, 'middle', 11, '#1d4ed8'));
      lines.push(rulerLabel(label, RULER_MARGIN - 8, y + 5, 'end', 11, '#1d4ed8'));
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lines.join('')}</svg>`;
    return await sharp(bytes)
      .flatten({ background: '#ffffff' })
      .extend({ top: RULER_MARGIN, left: RULER_MARGIN, right: RULER_TAIL, bottom: RULER_TAIL, background: '#ffffff' })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * The image the model was sent with a reading of it drawn over, for the second look
 * (`aiPlan.reviewPlanReading`): every room rectangle outlined in violet and numbered in its
 * corner (the room's place in the reading, from 1), solid blocks in grey, doors red, windows
 * blue, archways and open connections orange, railings green. Null when it cannot be drawn.
 */
export async function withReadingDrawn(vision: VisionInput, reading: AiPlanReading): Promise<string | null> {
  try {
    const bytes = Buffer.from(vision.image.base64, 'base64');
    const meta = await sharp(bytes).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return null;
    const left = vision.ruler ? RULER_MARGIN : 0;
    const w = vision.ruler ? W - RULER_MARGIN - RULER_TAIL : W;
    const h = vision.ruler ? H - RULER_MARGIN - RULER_TAIL : H;
    const px = (x: number) => left + x * w;
    const py = (y: number) => left + y * h;
    const stroke = Math.max(2, Math.round(Math.max(w, h) / 400));
    const marks: string[] = [];
    for (const v of reading.voids ?? []) {
      marks.push(`<rect x="${px(v.box.x0)}" y="${py(v.box.y0)}" width="${(v.box.x1 - v.box.x0) * w}" height="${(v.box.y1 - v.box.y0) * h}" fill="#6b7280" fill-opacity="0.45" stroke="#374151" stroke-width="${stroke}"/>`);
    }
    reading.rooms.forEach((room, r) => {
      for (const part of room.parts) {
        const { x0, y0, x1, y1 } = part.box;
        marks.push(`<rect x="${px(x0)}" y="${py(y0)}" width="${(x1 - x0) * w}" height="${(y1 - y0) * h}" fill="#7c3aed" fill-opacity="0.08" stroke="#7c3aed" stroke-width="${stroke}"/>`);
        const size = Math.max(14, Math.round(Math.max(w, h) / 60));
        marks.push(`<rect x="${px(x0) + stroke}" y="${py(y0) + stroke}" width="${size * 1.6}" height="${size * 1.5}" fill="#ffffff" fill-opacity="0.85"/>`);
        marks.push(rulerLabel(String(r + 1), px(x0) + stroke + size * 0.8, py(y0) + stroke + size * 1.25, 'middle', size, '#7c3aed'));
      }
    });
    const colour = { door: '#dc2626', window: '#2563eb', archway: '#ea580c', open: '#ea580c', railing: '#16a34a' } as const;
    for (const o of reading.openings) {
      marks.push(`<line x1="${px(o.from.x)}" y1="${py(o.from.y)}" x2="${px(o.to.x)}" y2="${py(o.to.y)}" stroke="${colour[o.kind]}" stroke-width="${stroke * 2.5}" stroke-linecap="round"${o.kind === 'open' ? ' stroke-dasharray="8 8"' : ''}/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${marks.join('')}</svg>`;
    const out = await sharp(bytes).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
    return out.toString('base64');
  } catch {
    return null;
  }
}
