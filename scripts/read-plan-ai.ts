/* eslint-disable no-console */
/**
 * Runs a real floor plan through the Claude reader and reports what came back at each stage.
 *
 *   pnpm plan:ai <plan.png>                                  read it (needs ANTHROPIC_API_KEY)
 *   pnpm plan:ai <plan.png> --save reading.json              also keep the raw reading
 *   pnpm plan:ai <plan.png> --replay reading.json            rebuild from a saved reading, no key
 *   pnpm plan:ai --replay reading.json                       the same without the image (no ink)
 *   … --overlay out.png                                      draw the result over the plan
 *   … --model claude-sonnet-5-5                              read with another model, to compare
 *
 * `pnpm test:solver` proves the geometry half without a key. This is the other half: what the
 * model actually says about a drawing, how the labels parse, and where the solved walls, the
 * separators and the doors end up against the drawing. Save a reading once and replay it while
 * tuning — a replay costs nothing and is deterministic, which is what you want when the
 * question is "did my change to the geometry help", not "what does the model think today".
 * The overlay draws the walls (black), separators (blue, dashed), doors (red), archways
 * (orange), windows (cyan) and railings (green) onto the image, through the solve's mapping
 * back from metres, so a wall off the drawing's wall is plain to see.
 */
import './lib/loadEnv';

import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { buildPlanFromReading, labelMetres, normaliseReading, readPlanWithClaudeDetailed, type AiPlanReading, type AiPlanResult } from '../lib/design/aiPlan';
import { prepareForVision } from '../lib/design/planVision';
import { pointOnEdge, roomEdges } from '../lib/design/planGeometry';
import { sniffImage } from '../lib/uploads/sniff';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const replay = flag('--replay');
const save = flag('--save');
const overlay = flag('--overlay');
const model = flag('--model');
const file = args.find((a) => !a.startsWith('--') && ![replay, save, overlay, model].includes(a));

async function main() {
  const raw = file ? readFileSync(file) : null;
  const mediaType = raw ? sniffImage(raw) : null;
  if (raw && !mediaType) {
    console.error('not a PNG/JPEG/WebP/GIF image');
    process.exit(1);
  }
  const vision = raw && mediaType ? await prepareForVision(raw, mediaType) : null;

  let reading: AiPlanReading;
  if (replay) {
    reading = normaliseReading(JSON.parse(readFileSync(replay, 'utf8')) as AiPlanReading);
    console.log(`\nreplaying ${replay}${vision ? ` against ${file}` : ' (no image: no ink)'}\n`);
  } else {
    if (!vision) {
      console.error('usage: pnpm plan:ai <plan.png|jpg> [--save reading.json] [--overlay out.png]   |   pnpm plan:ai [<plan.png>] --replay reading.json');
      process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set — add it to .env.local, or replay a saved reading with --replay');
      process.exit(1);
    }
    console.log(`\n${file}  ${(raw!.byteLength / 1024).toFixed(0)} KB → sent ${((vision.image.base64.length * 3) / 4 / 1024).toFixed(0)} KB as ${vision.image.mediaType}${vision.ruler ? ' with the ruler' : ''}\n`);
    const result = await readPlanWithClaudeDetailed({ imageBase64: vision.image.base64, mediaType: vision.image.mediaType, ruler: vision.ruler, ...(model ? { model } : {}) });
    reading = result.reading;
    console.log(`model    ${result.usage.model}`);
    console.log(`tokens   ${result.usage.inputTokens} in · ${result.usage.outputTokens} out`);
    console.log(`time     ${(result.usage.durationMs / 1000).toFixed(1)} s`);
    if (save) {
      writeFileSync(save, JSON.stringify(reading, null, 2));
      console.log(`saved    ${save}`);
    }
  }

  console.log(`\nreading  ${reading.rooms.length} rooms · ${reading.openings.length} openings · ${reading.unitSystem}`);
  if (reading.notes) console.log(`notes    ${reading.notes}`);
  console.log('\n  room                 type          part  box (x0,y0 → x1,y1)        width label → m      depth label → m');
  for (const room of reading.rooms) {
    room.parts.forEach((part, i) => {
      const w = part.widthLabel ? `${part.widthLabel} → ${labelMetres(part.widthLabel, reading.unitSystem)?.toFixed(2) ?? '??'}` : '—';
      const d = part.depthLabel ? `${part.depthLabel} → ${labelMetres(part.depthLabel, reading.unitSystem)?.toFixed(2) ?? '??'}` : '—';
      const b = part.box;
      const name = i === 0 ? room.name.padEnd(20).slice(0, 20) : ''.padEnd(20);
      const type = i === 0 ? room.type.padEnd(13) : ''.padEnd(13);
      console.log(`  ${name} ${type} ${String(i + 1).padEnd(4)}  ${b.x0.toFixed(2)},${b.y0.toFixed(2)} → ${b.x1.toFixed(2)},${b.y1.toFixed(2)}    ${w.padEnd(20)} ${d}`);
    });
  }
  for (const o of reading.openings) {
    const hinge = o.hinge ? `  hinge ${o.hinge.x.toFixed(2)},${o.hinge.y.toFixed(2)} into ${o.swingsInto ?? 'outside'}` : '';
    console.log(`  ${o.kind.padEnd(8)} ${o.roomA} ↔ ${o.roomB ?? 'outside'} (${o.side})  ${o.from.x.toFixed(2)},${o.from.y.toFixed(2)} → ${o.to.x.toFixed(2)},${o.to.y.toFixed(2)}${o.widthLabel ? `  ${o.widthLabel}` : ''}${hinge}`);
  }

  const built = buildPlanFromReading(reading, { ink: vision?.ink ?? null });
  const { plan } = built;
  const walls = plan.walls ?? [];
  console.log(`\nplan     ${plan.rooms.length} rooms · ${walls.filter((w) => !w.separator).length} walls · ${walls.filter((w) => w.separator).length} separators · ${plan.bounds.width.toFixed(2)} × ${plan.bounds.depth.toFixed(2)} m · worst residual ${(built.worstResidualM * 100).toFixed(1)} cm${built.lowConfidence ? '  ⚠︎ low confidence' : ''}`);
  console.log(`walls    x ${built.solve.xThickness.map((t) => t.toFixed(2)).join(' ')} · y ${built.solve.yThickness.map((t) => t.toFixed(2)).join(' ')} m thick`);
  for (const room of plan.rooms) {
    const xs = room.polygon.map((p) => p.x);
    const zs = room.polygon.map((p) => p.z);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...zs) - Math.min(...zs);
    const corners = room.polygon.length === 4 ? '' : `  ${room.polygon.length} corners`;
    console.log(`  ${room.name.padEnd(20).slice(0, 20)} ${room.type.padEnd(13)} ${w.toFixed(2)} × ${d.toFixed(2)} m  ${room.areaM2.toFixed(1).padStart(6)} m²${corners}${room.open?.length ? `  open ${room.open.length}` : ''}${room.lowConfidence ? '  ⚠︎' : ''}`);
    for (const o of room.openings) {
      const other = o.connectsToRoomId ? plan.rooms.find((r) => r.id === o.connectsToRoomId)?.name ?? o.connectsToRoomId : 'outside';
      const leaf = o.kind === 'door' ? `  hinge ${o.hinge} swing ${o.swing}` : '';
      console.log(`      ${o.kind.padEnd(8)} → ${other.padEnd(20).slice(0, 20)} wall ${o.wallIndex} t ${o.t.toFixed(2)} · ${o.widthM.toFixed(2)} m${leaf}`);
    }
  }

  if (overlay) {
    if (!raw) {
      console.error('\n--overlay needs the plan image');
    } else {
      await drawOverlay(raw, built, overlay);
      console.log(`\noverlay  ${overlay}`);
    }
  }
  console.log();
}

/** The plan drawn back onto the image through the solve's mapping. */
async function drawOverlay(raw: Buffer, built: AiPlanResult, out: string) {
  const meta = await sharp(raw).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const px = (p: { x: number; z: number }) => {
    const n = built.solve.toImage(p);
    return { x: n.x * w, y: n.y * h };
  };
  const shapes: string[] = [];
  for (const wall of built.plan.walls ?? []) {
    const a = px(wall.a);
    const b = px(wall.b);
    shapes.push(
      wall.separator
        ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2563eb" stroke-width="3" stroke-dasharray="6 4"/>`
        : `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7c3aed" stroke-opacity="0.55" stroke-width="${Math.max(2, (wall.thicknessM / built.solve.initialScale.x) * w)}"/>`
    );
  }
  const colour: Record<string, string> = { door: '#dc2626', archway: '#ea580c', window: '#0891b2', railing: '#16a34a' };
  for (const room of built.plan.rooms) {
    const poly = room.polygon.map(px).map((p) => `${p.x},${p.y}`).join(' ');
    shapes.push(`<polygon points="${poly}" fill="none" stroke="#16a34a" stroke-opacity="0.6" stroke-width="1"/>`);
    const xs = room.polygon.map((p) => px(p).x);
    const ys = room.polygon.map((p) => px(p).y);
    shapes.push(`<text x="${(Math.min(...xs) + Math.max(...xs)) / 2}" y="${(Math.min(...ys) + Math.max(...ys)) / 2 + 22}" font-family="sans-serif" font-size="11" fill="#16a34a" text-anchor="middle">${room.areaM2.toFixed(1)} m²</text>`);
    for (const o of room.openings) {
      const edge = roomEdges(room.polygon).find((e) => e.index === o.wallIndex);
      if (!edge) continue;
      const half = o.widthM / 2 / edge.length;
      const a = px(pointOnEdge(edge, Math.max(0, o.t - half)));
      const b = px(pointOnEdge(edge, Math.min(1, o.t + half)));
      shapes.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colour[o.kind]}" stroke-width="4"/>`);
      if (o.kind === 'door' && o.swing !== 'out') {
        const hinge = o.hinge === 'right' ? b : a;
        const leaf = px({ x: (o.hinge === 'right' ? pointOnEdge(edge, Math.min(1, o.t + half)) : pointOnEdge(edge, Math.max(0, o.t - half))).x + edge.inward.x * o.widthM, z: (o.hinge === 'right' ? pointOnEdge(edge, Math.min(1, o.t + half)) : pointOnEdge(edge, Math.max(0, o.t - half))).z + edge.inward.z * o.widthM });
        shapes.push(`<line x1="${hinge.x}" y1="${hinge.y}" x2="${leaf.x}" y2="${leaf.y}" stroke="${colour.door}" stroke-width="2"/>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shapes.join('')}</svg>`;
  await sharp(raw).flatten({ background: '#ffffff' }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
