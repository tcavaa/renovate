/* eslint-disable no-console */
/**
 * Runs a real floor plan through the Claude reader and reports what came back at each stage.
 *
 *   pnpm plan:ai public/uploads/plans/<file>.png            read it (needs ANTHROPIC_API_KEY)
 *   pnpm plan:ai <file> --save reading.json                 also keep the raw reading
 *   pnpm plan:ai --replay reading.json                      rebuild the plan from a saved reading, no key
 *
 * `pnpm test:solver` proves the geometry half without a key. This is the other half: what the
 * model actually says about a drawing, how the labels parse, and where the solved walls end up
 * against the printed dimensions. Save a reading once and replay it while tuning — a replay
 * costs nothing and is deterministic, which is what you want when the question is "did my
 * change to the solver help", not "what does the model think today".
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE_PX, buildPlanFromReading, normaliseReading, readPlanWithClaudeDetailed, type AiPlanReading } from '../lib/design/aiPlan';
import { parseLength } from '../lib/design/measure';
import { sniffImage } from '../lib/uploads/sniff';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const replay = flag('--replay');
const save = flag('--save');
const file = args.find((a) => !a.startsWith('--') && a !== replay && a !== save);

async function main() {
  let reading: AiPlanReading;

  if (replay) {
    reading = normaliseReading(JSON.parse(readFileSync(replay, 'utf8')) as AiPlanReading);
    console.log(`\nreplaying ${replay}\n`);
  } else {
    if (!file) {
      console.error('usage: pnpm plan:ai <plan.png|jpg> [--save reading.json]   |   pnpm plan:ai --replay reading.json');
      process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set — add it to .env.local, or replay a saved reading with --replay');
      process.exit(1);
    }
    const raw = readFileSync(file);
    const sniffed = sniffImage(raw);
    if (!sniffed) {
      console.error('not a PNG/JPEG/WebP/GIF image');
      process.exit(1);
    }
    let bytes = raw;
    let mediaType = sniffed;
    const meta = await sharp(raw).metadata();
    if (raw.byteLength > MAX_IMAGE_BYTES || Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_IMAGE_EDGE_PX * 1.5) {
      bytes = await sharp(raw).rotate().resize({ width: MAX_IMAGE_EDGE_PX, height: MAX_IMAGE_EDGE_PX, fit: 'inside' }).png().toBuffer();
      mediaType = 'image/png';
    }
    console.log(`\n${file}  ${meta.width} × ${meta.height}  ${(raw.byteLength / 1024).toFixed(0)} KB → sent ${(bytes.byteLength / 1024).toFixed(0)} KB as ${mediaType}\n`);

    const result = await readPlanWithClaudeDetailed({ imageBase64: bytes.toString('base64'), mediaType });
    reading = result.reading;
    console.log(`model    ${result.usage.model}`);
    console.log(`tokens   ${result.usage.inputTokens} in · ${result.usage.outputTokens} out`);
    console.log(`time     ${(result.usage.durationMs / 1000).toFixed(1)} s`);
    if (save) {
      writeFileSync(save, JSON.stringify(reading, null, 2));
      console.log(`saved    ${save}`);
    }
  }

  const unit = reading.unitSystem === 'imperial' ? 'ft' : 'm';
  console.log(`\nreading  ${reading.rooms.length} rooms · ${reading.openings.length} openings · ${reading.unitSystem}`);
  if (reading.notes) console.log(`notes    ${reading.notes}`);
  console.log('\n  room                 type          box (x0,y0 → x1,y1)         width label → m      depth label → m');
  for (const room of reading.rooms) {
    const w = room.widthLabel ? `${room.widthLabel} → ${parseLength(room.widthLabel, unit)?.metres.toFixed(2) ?? '??'}` : '—';
    const d = room.depthLabel ? `${room.depthLabel} → ${parseLength(room.depthLabel, unit)?.metres.toFixed(2) ?? '??'}` : '—';
    const b = room.box;
    console.log(`  ${room.name.padEnd(20).slice(0, 20)} ${room.type.padEnd(13)} ${b.x0.toFixed(2)},${b.y0.toFixed(2)} → ${b.x1.toFixed(2)},${b.y1.toFixed(2)}     ${w.padEnd(20)} ${d}`);
  }
  for (const o of reading.openings) {
    console.log(`  ${o.kind.padEnd(8)} ${o.roomA} ↔ ${o.roomB ?? 'outside'}  at ${o.at.x.toFixed(2)},${o.at.y.toFixed(2)}${o.widthLabel ? `  ${o.widthLabel}` : ''}`);
  }

  const built = buildPlanFromReading(reading);
  console.log(`\nplan     ${built.plan.rooms.length} rooms · ${built.plan.bounds.width.toFixed(2)} × ${built.plan.bounds.depth.toFixed(2)} m · worst residual ${(built.worstResidualM * 100).toFixed(1)} cm${built.lowConfidence ? '  ⚠︎ low confidence' : ''}`);
  for (const room of built.plan.rooms) {
    const xs = room.polygon.map((p) => p.x);
    const zs = room.polygon.map((p) => p.z);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...zs) - Math.min(...zs);
    console.log(`  ${room.name.padEnd(20).slice(0, 20)} ${room.type.padEnd(13)} ${w.toFixed(2)} × ${d.toFixed(2)} m  ${room.areaM2.toFixed(1).padStart(6)} m²  openings=${room.openings.length}${room.lowConfidence ? '  ⚠︎' : ''}`);
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
