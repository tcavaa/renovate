/**
 * The AI designer's second look: after the engine has laid the flat out and every slot has its
 * product, one Claude call checks each room as furnished — what is in it, how big, against which
 * wall, what the measurements found wrong (pieces in each other or in a wall, a nightstand away
 * from the bed, a mirror hung into the washing machine, a cabinet deeper than it is wide) — and
 * answers what to replace and what to take out. Server only (it holds the API key).
 *
 * As with the proposal (`aiDesign.ts`) the model hands over no coordinates: it names an item by
 * its id and a replacement by a product id from that item's alternatives, every one of them checked
 * (`validateReview`); the store puts a replacement where the old piece stood only if it fits there
 * (`designStore.applyReview`). Any failure → no review, and the flat stays as the engine laid it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ARCHETYPES, getArchetype } from './catalog';
import { candidatesFor, generationWeight, type CatalogProduct } from './matcher';
import { fitsRoom, productLine, side, DESIGN_MODEL, PRICE_PER_MTOK } from './aiDesign';
import { footprintInRoom, footprintOf, footprintsOverlap, PIECE_TOUCH_M, tucksUnder } from './manipulate';
import { roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { tightSpotsByItem } from './clearance';
import { randomSeed, seededRng, weightedOrder } from './random';
import type { DecorPiece, FloorPlan, PlacedItem, PlanRoom, StyleId } from './types';
import { MissingApiKeyError } from './aiPlan';

export interface AiReviewFix {
  itemId: string;
  action: 'replace' | 'remove';
  /** The replacement (one of the item's alternatives); null to remove. */
  productId: number | null;
  /** Why, in the person's language. */
  reason: string;
}

export interface AiReview {
  model: string;
  fixes: AiReviewFix[];
  /** A sentence per room on how it reads now, in the person's language. */
  notes: Record<string, string>;
}

export interface AiReviewRequest {
  plan: FloorPlan;
  items: PlacedItem[];
  decor?: DecorPiece[];
  styleId: StyleId;
  locale: 'ka' | 'en' | 'ru';
  catalog: CatalogProduct[];
  seed?: number;
  apiKey?: string;
  model?: string;
}

/** The pieces a room is for: replaced when wrong, never taken out. */
const KEEP_KINDS = new Set(['bed_double', 'bed_single', 'sofa_3seat', 'sofa_corner', 'toilet', 'sink', 'kitchen_run', 'desk', 'dining_table']);
/** Kinds made to measure or sized to the room: nothing to swap them for here. */
const NOT_REVIEWED = new Set(['kitchen_run', 'kitchen_wall', 'kitchen_island', 'rug', 'rug_bed', 'curtain', 'pendant']);
/** Kinds wider than deep by nature: one deeper than wide is a model turned sideways or a wrong product. */
const WIDE_KINDS = new Set(['wardrobe', 'dresser', 'sofa_3seat', 'tv_unit', 'console_table', 'bookshelf', 'storage_shelf', 'shoe_cabinet', 'desk', 'bathtub', 'kitchen_run']);
const ALTERNATIVES = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;
const cm = (m: number) => Math.round(m * 100);

function axes(rotation: number) {
  const forward = { x: Math.sin(rotation), z: Math.cos(rotation) };
  return { forward, right: { x: forward.z, z: -forward.x } };
}

/** The wall a piece's back stands on (within `slack`), how far along it its middle is, and the gap. */
function wallBehind(item: PlacedItem, room: PlanRoom, slack = 1): { edge: PlanEdge; along: number; gap: number } | null {
  const { forward } = axes(item.rotation);
  const back = { x: item.position.x - forward.x * (item.size.depth / 2), z: item.position.z - forward.z * (item.size.depth / 2) };
  let best: { edge: PlanEdge; along: number; gap: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    const turn = edge.facing - item.rotation;
    if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.05) continue;
    const along = (back.x - edge.a.x) * edge.dir.x + (back.z - edge.a.z) * edge.dir.z;
    if (along < -0.05 || along > edge.length + 0.05) continue;
    const gap = (back.x - edge.a.x) * edge.inward.x + (back.z - edge.a.z) * edge.inward.z;
    if (gap < -0.05 || gap > slack) continue;
    if (!best || gap < best.gap) best = { edge, along, gap: Math.max(0, gap) };
  }
  return best;
}

/**
 * What measuring each furnished room finds wrong, per room and item, in words the reviewer reads:
 * pieces in each other or through a wall, a piece standing off the wall it backs onto, one
 * deeper than wide where that kind never is, a piece hung into what stands under it, a mirror
 * not over the basin, a nightstand away from the bed's head, a passage too tight to get through.
 */
export function reviewFindings(plan: FloorPlan, items: PlacedItem[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const say = (id: string, text: string) => out.set(id, [...(out.get(id) ?? []), text]);
  const tight = tightSpotsByItem(plan.rooms, items);
  for (const room of plan.rooms) {
    const inRoom = items.filter((i) => i.roomId === room.id && i.product);
    const floor = inRoom.filter((i) => i.elevationM < 0.05 && !ARCHETYPES[i.kind]?.ghost);
    for (const item of inRoom) {
      const rule = getArchetype(item.kind)?.placement;
      const footprint = footprintOf(item.position, item.size, item.rotation);
      if (item.elevationM < 0.05 && !ARCHETYPES[item.kind]?.ghost && !footprintInRoom(footprint, room.polygon)) say(item.id, 'stands through a wall');
      if (WIDE_KINDS.has(item.kind) && item.size.depth > item.size.width * 1.1) say(item.id, `is deeper (${cm(item.size.depth)} cm) than wide (${cm(item.size.width)} cm) — turned sideways or not this kind of piece`);
      if ((rule?.type === 'wall' || rule?.type === 'wall-run') && item.elevationM < 0.05) {
        const wall = wallBehind(item, room);
        if (wall && wall.gap > 0.08) say(item.id, `stands ${cm(wall.gap)} cm off the wall behind it`);
      }
      if (item.elevationM >= 0.05 && rule?.type === 'wall-mounted') {
        for (const below of floor) {
          if (below.size.height <= item.elevationM) continue;
          if (footprintsOverlap(footprint, footprintOf(below.position, below.size, below.rotation), 0)) say(item.id, `hangs into the ${below.kind.replace(/_/g, ' ')} below it (${below.id})`);
        }
        if (item.slot === 'mirror' && (room.type === 'bathroom' || room.type === 'toilet')) {
          const sink = floor.find((i) => i.slot === 'sink');
          if (sink && Math.hypot(sink.position.x - item.position.x, sink.position.z - item.position.z) > 0.6) say(item.id, 'is not over the basin');
        }
      }
      if (item.slot === 'mirror' && item.elevationM < 0.05 && (room.type === 'bathroom' || room.type === 'toilet')) say(item.id, 'is a standing floor mirror in a bathroom, not a mirror over the basin');
      if (item.slot === 'nightstand') {
        const bed = floor.find((i) => i.slot === 'bed');
        if (bed) {
          const { forward, right } = axes(bed.rotation);
          const off = { x: item.position.x - bed.position.x, z: item.position.z - bed.position.z };
          const across = Math.abs(off.x * right.x + off.z * right.z) - bed.size.width / 2 - item.size.width / 2;
          const head = off.x * forward.x + off.z * forward.z - (-bed.size.depth / 2 + item.size.depth / 2);
          if (across > 0.25 || Math.abs(head) > 0.3) say(item.id, `is not beside the head of the bed (${cm(Math.max(0, across))} cm off its side, ${cm(Math.abs(head))} cm from its head)`);
        }
      }
      const spot = tight.get(item.id);
      if (spot) say(item.id, spot.against === 'door' ? `stands in a doorway's way (${cm(spot.gapM)} cm)` : `leaves only ${cm(spot.gapM)} cm to walk past (${spot.against})`);
    }
    for (let i = 0; i < floor.length; i++) {
      for (let j = i + 1; j < floor.length; j++) {
        const a = floor[i];
        const b = floor[j];
        if (tucksUnder(a, b)) continue;
        if (footprintsOverlap(footprintOf(a.position, a.size, a.rotation), footprintOf(b.position, b.size, b.rotation), PIECE_TOUCH_M)) {
          say(a.id, `overlaps the ${b.kind.replace(/_/g, ' ')} (${b.id})`);
          say(b.id, `overlaps the ${a.kind.replace(/_/g, ' ')} (${a.id})`);
        }
      }
    }
  }
  return out;
}

/** How a piece stands, in words: against which wall and where, or free in the room; at what height if hung. */
function whereItStands(item: PlacedItem, room: PlanRoom): string {
  const wall = wallBehind(item, room, 0.35);
  if (wall) {
    const at = `back to wall ${wall.edge.index} (${side(wall.edge)}), its middle ${r2(wall.along)} m along ${r2(wall.edge.length)} m`;
    return item.elevationM >= 0.05 ? `${at}, hung ${r2(item.elevationM)}–${r2(item.elevationM + item.size.height)} m up` : at;
  }
  return `free-standing, facing ${['bottom', 'right', 'top', 'left'][((Math.round(item.rotation / (Math.PI / 2)) % 4) + 4) % 4]}`;
}

export interface ReviewOffer {
  /** Per item: the product ids it may be replaced with. */
  alternatives: Map<string, Set<number>>;
  itemsById: Map<string, PlacedItem>;
}

/** The furnished flat as the reviewer reads it, and what each piece may be replaced with. */
export function buildReviewBrief(request: AiReviewRequest): { text: string; offer: ReviewOffer; seed: number } {
  const { plan, items, catalog, styleId } = request;
  const seed = request.seed ?? randomSeed();
  const rng = seededRng(seed);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const findings = reviewFindings(plan, items);
  const alternatives = new Map<string, Set<number>>();
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const lines: string[] = [];
  const offered = new Map<number, CatalogProduct>();
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));

  for (const room of plan.rooms) {
    const inRoom = items.filter((i) => i.roomId === room.id && i.product);
    if (inRoom.length === 0) continue;
    lines.push(`\n## Room ${room.id} — "${room.name}" (${room.type}), ${r2(room.areaM2)} m², ceiling ${r2(room.heightM)} m`);
    wallEdges(room).forEach((edge) => {
      const openings = room.openings
        .filter((o) => o.wallIndex === edge.index)
        .map((o) => {
          const at = o.t * edge.length;
          const span = `${r2(at - o.widthM / 2)}–${r2(at + o.widthM / 2)} m`;
          const to = o.connectsToRoomId ? ` to "${roomName.get(o.connectsToRoomId) ?? 'another room'}"` : o.exterior && o.kind === 'door' ? ' (entrance)' : '';
          return `${o.kind} ${span}${to}`;
        });
      lines.push(`- wall ${edge.index} (${side(edge)}), ${r2(edge.length)} m${openings.length ? `: ${openings.join('; ')}` : ''}`);
    });
    // Pieces of one kind in a room are one set (two nightstands): offered once, replaced together.
    const sets = new Map<string, PlacedItem[]>();
    for (const item of inRoom) sets.set(item.kind, [...(sets.get(item.kind) ?? []), item]);
    for (const [kind, set] of sets) {
      const first = set[0];
      const product = byId.get(first.product!.productId);
      const name = product?.nameEn ?? first.product!.nameEn ?? first.product!.nameKa;
      const head = `- ${set.map((i) => i.id).join(', ')}: ${kind.replace(/_/g, ' ')}${set.length > 1 ? ` ×${set.length}` : ''} — ${first.product!.productId} "${name}" ${cm(first.size.width)}×${cm(first.size.depth)}×${cm(first.size.height)} cm, ${Math.round(first.product!.pricePerUnit)}₾`;
      lines.push(head);
      for (const item of set) {
        const problems = findings.get(item.id) ?? [];
        lines.push(`  · ${item.id}: ${whereItStands(item, room)}${problems.length ? ` — PROBLEMS: ${problems.join('; ')}` : ''}`);
      }
      if (NOT_REVIEWED.has(kind)) continue;
      const troubled = set.some((i) => (findings.get(i.id) ?? []).length > 0);
      const current = first.product!.productId;
      // Another product of the kind that fits the room: the style's own likelier; when the piece is in
      // trouble, the ones no bigger than it far likelier — the fix for a piece that does not fit.
      const pool = candidatesFor(kind, catalog, styleId).filter((p) => p.id !== current && fitsRoom(p, room));
      const smaller = (p: CatalogProduct) => !!p.widthCm && !!p.depthCm && p.widthCm / 100 <= first.size.width + 0.02 && p.depthCm / 100 <= first.size.depth + 0.02;
      const picks = weightedOrder(pool, (p) => generationWeight(p, styleId, 'balanced', first, false) * (troubled && smaller(p) ? 6 : 1), rng).slice(0, ALTERNATIVES);
      if (picks.length === 0) continue;
      for (const item of set) alternatives.set(item.id, new Set(picks.map((p) => p.id)));
      for (const p of picks) offered.set(p.id, p);
      lines.push(`  alternatives: ${picks.map((p) => p.id).join(', ')}`);
    }
    const decor = (request.decor ?? []).filter((d) => d.roomId === room.id);
    if (decor.length) lines.push(`Built-in decor: ${decor.map((d) => `${d.family}${d.wallIndex == null ? ' round the room' : ` on its wall ${d.wallIndex} ${r2(d.span.from)}–${r2(d.span.to)} m`}`).join('; ')}`);
  }

  const text = [
    `Style: ${styleId}. Write every reason and note in ${request.locale === 'ka' ? 'Georgian' : request.locale === 'ru' ? 'Russian' : 'English'}.`,
    `\n# The furnished flat${lines.join('\n')}`,
    `\n# Alternative products (id | name | width×depth×height | price | style tags | colour)\n${[...offered.values()].map(productLine).join('\n')}`,
  ].join('\n');
  return { text, offer: { alternatives, itemsById }, seed };
}

const SYSTEM_PROMPT = `You are the interior designer of a Georgian home renovation platform, checking a flat the layout engine has just furnished from real shop products. You see each room as built: its walls with doors and windows, every piece with its product, real size and where it stands, and what measuring the room found wrong (PROBLEMS).

Look at every room as a designer walking through it would, and fix what is wrong:
- a product that is not the piece it stands for (a room divider hung as curtains, a toy or a wall hook as the bedroom's art, a step stool as a dining chair, a floor mirror over a basin);
- a piece too big for its place or in another's way — the PROBLEMS say where; prefer an alternative no bigger than it;
- a piece that clashes with the style or with the room's other pieces (a gothic bed among Scandinavian pine, a children's lamp in the master bedroom), or a set that does not belong together;
- a piece the room is better without (a second storage piece blocking a passage, a plant crowding a small bathroom).

Rules:
- Fix only what is wrong; most pieces should stay. A room with nothing wrong gets no fixes.
- "replace": with one of that piece's own alternatives, by id. Pieces of one kind in a room are a set (two nightstands): replacing one replaces them all.
- "remove": only decor and extra pieces — never the bed, the sofa, the desk, the dining table, the toilet, the basin or the kitchen.
- product is 0 when you remove.
- A problem you cannot fix with what is offered: leave the piece (the person will move it).
- reason: one short sentence the person reads, saying what was wrong. note: one sentence per room on how it reads now.`;

/** The answer: per room, its note and fixes. No unions or nullables (structured outputs' limits): product 0 = none. */
export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rooms'],
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['room', 'note', 'fixes'],
        properties: {
          room: { type: 'string' },
          note: { type: 'string' },
          fixes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['item', 'action', 'product', 'reason'],
              properties: {
                item: { type: 'string' },
                action: { type: 'string', enum: ['replace', 'remove'] },
                product: { type: 'integer' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

interface RawReview {
  rooms?: Array<{ room?: string; note?: string; fixes?: Array<{ item?: string; action?: string; product?: number; reason?: string }> }>;
}

/**
 * Keeps what the answer may do: an item of that room, a replacement from that item's own
 * alternatives (applied to every piece of its set), a removal only of what a room can do without,
 * at most six fixes a room; anything else is dropped.
 */
export function validateReview(raw: RawReview, plan: FloorPlan, offer: ReviewOffer, model: string): AiReview {
  const fixes: AiReviewFix[] = [];
  const notes: Record<string, string> = {};
  const seen = new Set<string>();
  const rooms = new Set(plan.rooms.map((r) => r.id));
  for (const room of raw.rooms ?? []) {
    if (!room.room || !rooms.has(room.room)) continue;
    if (typeof room.note === 'string' && room.note.trim()) notes[room.room] = room.note.trim().slice(0, 400);
    let count = 0;
    for (const fix of room.fixes ?? []) {
      if (count >= 6) break;
      const item = fix.item ? offer.itemsById.get(fix.item) : undefined;
      if (!item || item.roomId !== room.room || seen.has(item.id)) continue;
      const reason = typeof fix.reason === 'string' ? fix.reason.trim().slice(0, 300) : '';
      const set = [...offer.itemsById.values()].filter((i) => i.roomId === item.roomId && i.kind === item.kind);
      if (fix.action === 'replace') {
        if (!fix.product || !offer.alternatives.get(item.id)?.has(fix.product)) continue;
        for (const piece of set) {
          seen.add(piece.id);
          fixes.push({ itemId: piece.id, action: 'replace', productId: fix.product, reason });
        }
        count++;
      } else if (fix.action === 'remove') {
        if (KEEP_KINDS.has(item.kind)) continue;
        seen.add(item.id);
        fixes.push({ itemId: item.id, action: 'remove', productId: null, reason });
        count++;
      }
    }
  }
  return { model, fixes, notes };
}

export interface AiReviewUsage {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  model: string;
  costUsd: number;
  seed: number;
}

export async function reviewWithClaude(request: AiReviewRequest): Promise<{ review: AiReview; usage: AiReviewUsage }> {
  const apiKey = request.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  const model = request.model ?? DESIGN_MODEL;
  const { text, offer, seed } = buildReviewBrief(request);
  const client = new Anthropic({ apiKey });
  const started = Date.now();
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 16000,
    ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: `Check this flat room by room.\n${text}` }] }],
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('The reviewer declined');
  if (response.stop_reason === 'max_tokens') throw new Error('The reviewer ran out of room');
  const block = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!block) throw new Error(`The reviewer returned nothing (stop_reason: ${response.stop_reason})`);
  const review = validateReview(JSON.parse(block.text) as RawReview, request.plan, offer, response.model);
  const u = response.usage;
  const price = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK[DESIGN_MODEL];
  const costUsd = (u.input_tokens * price.input + u.output_tokens * price.output + (u.cache_read_input_tokens ?? 0) * price.cacheRead + (u.cache_creation_input_tokens ?? 0) * price.cacheWrite) / 1_000_000;
  return { review, usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, durationMs: Date.now() - started, model: response.model, costUsd: Math.round(costUsd * 10000) / 10000, seed } };
}
