/**
 * The AI interior designer: one Claude call per generation that furnishes and finishes the whole
 * flat — product picks per room and kind, a floor and a wall per room, custom wall decor as
 * intents — from lists the server prepared. Server only (it holds the API key).
 *
 * The model never hands over coordinates that are trusted (docs/design-studio/ai-layout-plan.md):
 * it names products by id from the candidates offered, finishes from the room's own pools, decor
 * by family, anchor and material ids; every id it returns is checked against what it was offered
 * (`validateProposal`), and the engine and `lib/design/decor/resolve` turn the rest into
 * geometry the studio checks like its own. No key, an error, a refusal or an answer that does not
 * validate → the caller falls back to the engine, silently.
 */

import Anthropic from '@anthropic-ai/sdk';
import referenceLibrary from './decor/reference-library.json';
import { ROOM_PROGRAMS, resolveVariant } from './catalog';
import { candidatesFor, generationWeight, type CatalogProduct } from './matcher';
import { randomSeed, seededRng, weightedOrder } from './random';
import { styleAffinity } from './styles';
import { finishCandidates, type AiProposal, type AiRoomProposal } from './aiProposal';
import { wallEdges, type PlanEdge } from './planGeometry';
import { freeSpans } from './decor/layout';
import { DECOR_FAMILIES, DECOR_FAMILY_LIST, decorSlots, slotTakes } from './decor/families';
import { DECOR_ANCHORS, type DecorIntent } from './decor/resolve';
import { decorMaterialKind, decorSpecs, isDecorMaterial } from './decor/materials';
import type { DecorFamily, DecorParams, DecorSlot, FloorPlan, PlanRoom, StyleId, StyleProfile } from './types';
import type { RoomType } from '@/lib/calculator/types';
import { MissingApiKeyError } from './aiPlan';

/** The model: the same one that reads plans. A constant, chosen by evaluation, never a guess in code. */
export const DESIGN_MODEL = 'claude-opus-5-5';

export interface AiDesignRequest {
  plan: FloorPlan;
  styleId: StyleId;
  styleProfile?: StyleProfile | null;
  budgetGel?: number | null;
  locale: 'ka' | 'en' | 'ru';
  catalog: CatalogProduct[];
  /**
   * The draw for this generation (`lib/design/random`): which products, finishes and direction the
   * designer is offered. A fresh one every time — the same style on two flats, or one flat generated
   * twice, is offered different lists and designed differently. Fixed only to reproduce a run.
   */
  seed?: number;
  /** What the flat's last design used — offered far less often, and named so the designer moves on from it. */
  previous?: { productIds: number[]; decorFamilies: string[] } | null;
  apiKey?: string;
  model?: string;
}

export interface AiDesignUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  model: string;
  /** What the call cost at the model's list price, US dollars (Opus 5.5: $4 / $20 per million, cache reads $0.20). */
  costUsd: number;
  /** The draw it was offered (`AiDesignRequest.seed`), to reproduce a run. */
  seed: number;
}

// ---------------------------------------------------------------------------
// What the model is offered
// ---------------------------------------------------------------------------

const KINDS_FURNISHED_BY_ENGINE = new Set(['kitchen_run', 'kitchen_wall', 'kitchen_island']);
/** Products offered per piece and finishes per surface: a random draw from the whole catalogue each time, not the same top few. */
const CANDIDATES_PER_KIND = 12;
const FINISHES_PER_SURFACE = 10;
/** How much less often something the last design used is drawn again. */
const PREVIOUS_WEIGHT = 0.04;

/**
 * A direction for each generation — a palette and a mood within the style, drawn at random — so the
 * designer does not settle on one favourite look per style: two Scandinavian flats come out pale
 * oak and sage, or birch and dusty blue.
 */
const DIRECTIONS: Record<StyleId, string[]> = {
  modern: [
    'warm greige and walnut with black metal accents',
    'cool white, concrete grey and smoked glass',
    'taupe, travertine and brushed brass',
    'graphite, light oak and deep olive accents',
    'soft white and warm sand with bouclé textures',
    'charcoal, marble and caramel leather',
  ],
  scandinavian: [
    'pale oak, warm white and sage green',
    'birch, linen and dusty blue',
    'ash, oatmeal textiles and black accents',
    'smoked oak, clay and cream',
    'white-washed wood, soft greys and rattan',
    'light walnut, mustard and off-white',
  ],
  industrial: [
    'black steel, red brick and cognac leather',
    'concrete grey, walnut and charcoal',
    'raw oak, blackened metal and olive',
    'smoked glass, grey brick and rust tones',
    'dark timber, graphite and warm amber light',
    'microcement, black-stained oak and tan',
  ],
  vintage: [
    'walnut, cream and deep green velvet',
    'mahogany, ivory mouldings and brass',
    'warm cherry, dusty rose and gold',
    'dark oak, navy and botanical prints',
    'ochre, terracotta and carved wood',
    'cream panelling, sage and antique bronze',
  ],
};

/** A piece the room cannot hold is not offered: its footprint must fit inside the room's outline. */
function fitsRoom(p: CatalogProduct, room: PlanRoom): boolean {
  if (!p.widthCm || !p.depthCm) return true;
  const xs = room.polygon.map((v) => v.x);
  const zs = room.polygon.map((v) => v.z);
  const long = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const short = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const a = Math.max(p.widthCm, p.depthCm) / 100;
  const b = Math.min(p.widthCm, p.depthCm) / 100;
  return a <= long - 0.2 && b <= short - 0.5;
}

export interface Offer {
  /** Per room: kind → product ids offered. */
  furniture: Map<string, Map<string, Set<number>>>;
  floors: Map<string, Set<number>>;
  walls: Map<string, Set<number>>;
  decorMaterials: Map<number, CatalogProduct>;
  referenceIds: Set<string>;
}

/** Which side of the plan a wall is on, as the drawing shows it. */
function side(edge: PlanEdge): string {
  if (edge.inward.z > 0.5) return 'top';
  if (edge.inward.z < -0.5) return 'bottom';
  if (edge.inward.x > 0.5) return 'left';
  return 'right';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The kinds the engine lays out in a room of this type and size (the room program). */
export function programKinds(room: PlanRoom): string[] {
  const types: RoomType[] = room.type === 'studio' ? ['kitchen', 'living_room'] : [room.type];
  const kinds = new Set<string>();
  for (const type of types) {
    for (const entry of ROOM_PROGRAMS[type] ?? []) {
      if (entry.minAreaM2 && room.areaM2 < entry.minAreaM2) continue;
      kinds.add(resolveVariant(entry, room.areaM2));
    }
  }
  return [...kinds].filter((k) => !KINDS_FURNISHED_BY_ENGINE.has(k));
}

function productLine(p: CatalogProduct): string {
  const size = p.widthCm && p.depthCm && p.heightCm ? `${Math.round(p.widthCm)}×${Math.round(p.depthCm)}×${Math.round(p.heightCm)}cm` : '';
  const styles = Array.isArray(p.styleTags) ? (p.styleTags as string[]).slice(0, 3).join('/') : '';
  return `${p.id} | ${p.nameEn ?? p.nameKa} | ${size} | ${Math.round(p.pricePerUnit)}₾ | ${styles}${p.colorHex ? ` | ${p.colorHex}` : ''}`;
}

/** The flat as the model reads it, and what it may choose from. */
export function buildBrief(request: AiDesignRequest): { text: string; offer: Offer; seed: number } {
  const { plan, styleId, catalog } = request;
  const seed = request.seed ?? randomSeed();
  const rng = seededRng(seed);
  const used = new Set(request.previous?.productIds ?? []);
  const fresh = (p: CatalogProduct) => (used.has(p.id) ? PREVIOUS_WEIGHT : 1);
  const offer: Offer = { furniture: new Map(), floors: new Map(), walls: new Map(), decorMaterials: new Map(), referenceIds: new Set() };
  const products = new Map<number, CatalogProduct>();
  const lines: string[] = [];
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));

  for (const room of plan.rooms) {
    lines.push(`\n## Room ${room.id} — "${room.name}" (${room.type}), ${r2(room.areaM2)} m², ceiling ${r2(room.heightM)} m${room.polygon.length === 4 ? ', rectangular' : ', L-shaped'}`);
    for (const edge of wallEdges(room)) {
      const openings = room.openings
        .filter((o) => o.wallIndex === edge.index)
        .map((o) => {
          const at = o.t * edge.length;
          const span = `${r2(at - o.widthM / 2)}–${r2(at + o.widthM / 2)} m`;
          if (o.kind === 'window') return `window ${span}, sill ${r2(o.sillM)} m, head ${r2(o.sillM + o.heightM)} m`;
          if (o.kind === 'railing') return `balcony railing ${span}`;
          const to = o.connectsToRoomId ? ` to "${roomName.get(o.connectsToRoomId) ?? 'another room'}"` : o.exterior ? ' (entrance)' : '';
          return `${o.kind} ${span}${to}`;
        });
      const clear = freeSpans(edge, room.openings, 0, edge.length, 0.1).map(([a, b]) => `${r2(a)}–${r2(b)}`);
      lines.push(`- wall ${edge.index} (${side(edge)} side), ${r2(edge.length)} m: ${openings.length ? openings.join('; ') : 'solid'}${clear.length ? `; clear stretches ${clear.join(', ')} m` : '; no clear stretch'}`);
    }
    // The pieces the engine will lay out here, with the products that may fill each.
    const kinds = programKinds(room);
    const byKind = new Map<string, Set<number>>();
    for (const kind of kinds) {
      // A fresh draw from every product of the kind that fits the room: the style's own and the
      // well-priced more likely (`generationWeight`), any of them possible, the last design's rarely.
      const pool = candidatesFor(kind, catalog, styleId).filter((p) => fitsRoom(p, room));
      const ranked = weightedOrder(pool, (p) => generationWeight(p, styleId, 'balanced', undefined, false) * fresh(p), rng).slice(0, CANDIDATES_PER_KIND);
      if (ranked.length === 0) continue;
      byKind.set(kind, new Set(ranked.map((p) => p.id)));
      for (const p of ranked) products.set(p.id, p);
    }
    offer.furniture.set(room.id, byKind);
    if (byKind.size) lines.push(`Pieces the engine lays out (choose a product for each): ${[...byKind.entries()].map(([k, ids]) => `${k} [${[...ids].join(', ')}]`).join('; ')}`);
    for (const surface of ['floor', 'wall'] as const) {
      const all = finishCandidates(catalog, room, surface, styleId);
      const pool = weightedOrder(all, (p) => ([1, 3, 8][styleAffinity(styleId, p.styleTags, p.tags)] ?? 1) * fresh(p), rng).slice(0, FINISHES_PER_SURFACE);
      (surface === 'floor' ? offer.floors : offer.walls).set(room.id, new Set(pool.map((p) => p.id)));
      if (pool.length) lines.push(`${surface} finishes: ${pool.map((p) => `${p.id} ${p.nameEn ?? p.nameKa}${p.colorHex ? ` ${p.colorHex}` : ''}`).join('; ')}`);
    }
  }

  const productList = [...products.values()].map(productLine).join('\n');

  for (const p of catalog) if (isDecorMaterial(p)) offer.decorMaterials.set(p.id, p);
  // In no particular order, so the list's first lines are not the designer's habit.
  const materialList = weightedOrder([...offer.decorMaterials.values()], () => 1, rng)
    .map((p) => `${p.id} | ${decorMaterialKind(p)} | ${p.nameEn ?? p.nameKa} | ${Math.round(p.pricePerUnit)}₾/${p.unit === 'linear_m' ? 'm' : p.unit === 'piece' ? 'pc' : 'm²'} | ${p.colorHex ?? ''}${decorSpecs(p).tintable ? ' | tintable' : ''}`)
    .join('\n');

  const types = new Set(plan.rooms.map((r) => r.type));
  const entries = referenceLibrary.entries.filter((e) => e.style === styleId && types.has(e.room_type as RoomType));
  for (const e of entries) offer.referenceIds.add(e.id);
  // Each entry's concepts in a random order: the first is this flat's lean, not always the same one.
  const library = entries
    .map((e) => `- ${e.id}: ${weightedOrder(e.concepts, () => 1, rng).join(' / ')} | families ${e.families.join(', ')} | ${e.composition_rule} | ${e.room_constraint}`)
    .join('\n');
  const direction = DIRECTIONS[styleId][Math.floor(rng() * DIRECTIONS[styleId].length)];
  const previous = request.previous && (request.previous.productIds.length || request.previous.decorFamilies.length)
    ? `\nThis flat's previous design used products ${request.previous.productIds.slice(0, 60).join(', ') || 'none'}${request.previous.decorFamilies.length ? ` and decor families ${[...new Set(request.previous.decorFamilies)].join(', ')}` : ''}. The person asked for a new design: choose differently wherever the lists allow.`
    : '';

  const profile = request.styleProfile ? `Style test answers: ${JSON.stringify(request.styleProfile.answers)}.` : '';
  const text = [
    `Style: ${styleId}. ${profile} Furniture budget: ${request.budgetGel ? `${request.budgetGel} GEL for the whole flat` : 'not set (mid-range)'}. Write every note and concept in ${request.locale === 'ka' ? 'Georgian' : request.locale === 'ru' ? 'Russian' : 'English'}.`,
    `Direction for this flat: ${direction}. Interpret it within the style through the products, the finishes and the decor.${previous}`,
    `\n# The flat${lines.join('\n')}`,
    `\n# Products offered (id | name | W×D×H | price | styles | colour)\n${productList}`,
    `\n# Decor materials (id | kind | name | price per unit | colour | tintable)\n${materialList}`,
    `\n# Decor references for this style and these rooms (realise one concept per piece; they are starting points, not rules)\n${library}`,
  ].join('\n');
  return { text, offer, seed };
}

// ---------------------------------------------------------------------------
// The prompt and the answer's shape
// ---------------------------------------------------------------------------

const SLOT_KINDS = DECOR_FAMILY_LIST.map((f) => `${f}: ${decorSlots(f).map((s) => `${s} (${DECOR_FAMILIES[f].slots[s]!.kinds.join('/')}${DECOR_FAMILIES[f].slots[s]!.optional ? ', optional' : ''})`).join(', ')}`).join('\n');

const SYSTEM_PROMPT = `You are the interior designer of a Georgian home renovation platform. After a person takes the style test, you furnish and finish their whole flat at once — coherently, like one designer's work — and add custom wall decor that is built to measure (slatted panels, stone slabs, mouldings, niches, light lines, upholstered or relief panels, cladding, murals, tiled fields).

Everything you choose is real and purchasable: you pick products and materials only by the ids offered, never invent one. You decide intent; the platform's engine decides exact geometry and checks it (it places the furniture in each room, then fits your decor to the walls and around doors and windows). So you never give coordinates — you give anchors, walls and sizes in metres.

## Furniture and finishes
- For each room, choose one product per piece listed under "Pieces the engine lays out", from that piece's ids. Leave a piece out to let the engine choose. The lists are a fresh random draw from the catalogue for every flat and in no order: consider every id, not the first ones, and follow the flat's direction — no two flats should come out alike. Pieces in one room should belong together (materials, colours, scale); keep a palette of at most 3–4 colour families per room, consistent across the flat, and respect the budget (mid-range when none is set).
- Choose one floor and one wall finish per room from its own lists (0 keeps the style's default). Keep floors continuous through living spaces; calmer walls in bedrooms; wet rooms only from their wet lists.

## Custom wall decor
- Realise concepts from the decor references for the style. Use 1–2 pieces in living rooms, bedrooms, offices and studios; at most one in a hallway, kitchen or bathroom; none is fine (storage, closets, toilets, balconies usually get none). Never more than 3 in a room, never two on the same stretch of wall.
- anchor: bed | tv | sofa | desk | dining — centred on that piece, on the wall it stands against (only for pieces the room has: bed in bedrooms, tv/sofa in living rooms, desk in offices, dining where a dining table is laid out); wall — on wall "wallIndex" (the wall numbers above; it is fitted to that wall's longest clear stretch; -1 with any other anchor); room — a light cove round the ceiling (rectangular rooms only).
- widthM: 0 lets the engine size it (the anchor's width plus a margin, or the whole clear stretch); give a number only when the design needs it. heightFromM / heightToM: -1 for the family's default (a slab behind a TV 0.65–2.45 m, slats behind a bed from 1.0 m to near the ceiling, an upholstered headboard panel 0.35–1.6 m, a tiled field up to 1.2 m, everything else floor to ceiling); give numbers for a half-height wainscot or a panel above a headboard.
- Families and the materials each part takes (slot (material kinds)):
${SLOT_KINDS}
  For each slot give a material id of a kind it takes (leave an optional slot out to go without it), and colorHex only for a tintable material (paint, lacquer, dyed fabric) — a hex colour that suits the palette; \"\" otherwise.
- params (\"auto\", 0 or -1 for the default; yes/no for switches): slats slatWidthMm 20–45, gapMm 10–25, depthMm 10–30, backing yes/no (no = a see-through screen); led none|bottom|top|halo|inside where the family has a led slot (halo behind a stood-off slab, inside a niche, bottom/top along slats or panels) — keep light out of eyes over a bed's pillows; moulding dadoMm 900–1100, bayWidthMm 600–1000, upper/lower/rail yes/no; niche shape arch|rect, count 1–3, nicheWidthMm 500–1000, nicheHeightMm 1200–2200, shelves 0–4, mantel yes only for a pair of niches either side of a decorative mantel on a wall of at least 3.2 m; panel style upholstered|fluted|flat, moduleWidthMm (upholstered channels 120–300, flutes 40–80); slab moduleWidthMm/moduleHeightMm the slab size (seams fall there); tile border yes/no; light path cove|line.
- Follow each reference's composition rule and room constraint: centre a feature on its focal piece, keep sockets, doors, windows and circulation clear, wet-zone materials in bathrooms (tile, stone, niches; no timber, wallpaper or fabric in a shower), nothing projecting over a bed's pillows.
- Each decor piece: referenceId (the reference you realised, or \"\"), concept (a short title in the person's language), note (one sentence on why, in the person's language).

## Notes
- Per room, note: one or two sentences in the person's language on the idea of the room (palette, materials, the feature wall). Plain, warm, specific; no marketing.`;

/*
 * The answer's shape. Structured output allows at most 16 nullable (union) fields in a schema, so
 * nothing here is nullable: "use the default" is a sentinel instead — 0 for a number, "" for a
 * string, "auto" for a choice — and `validateProposal` reads the sentinels back as absent.
 */
const AUTO = 'auto';
const choice = (values: string[]) => ({ type: 'string', enum: [AUTO, ...values] });
const yesNo = choice(['yes', 'no']);

const PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slatWidthMm', 'gapMm', 'depthMm', 'backing', 'led', 'dadoMm', 'bayWidthMm', 'upper', 'lower', 'rail', 'shape', 'count', 'nicheWidthMm', 'nicheHeightMm', 'shelves', 'mantel', 'moduleWidthMm', 'moduleHeightMm', 'style', 'border', 'path'],
  properties: {
    slatWidthMm: { type: 'number' },
    gapMm: { type: 'number' },
    depthMm: { type: 'number' },
    backing: yesNo,
    led: choice(['none', 'bottom', 'top', 'halo', 'inside']),
    dadoMm: { type: 'number' },
    bayWidthMm: { type: 'number' },
    upper: yesNo,
    lower: yesNo,
    rail: yesNo,
    shape: choice(['arch', 'rect']),
    count: { type: 'integer' },
    nicheWidthMm: { type: 'number' },
    nicheHeightMm: { type: 'number' },
    shelves: { type: 'integer', description: '-1 for the default' },
    mantel: yesNo,
    moduleWidthMm: { type: 'number' },
    moduleHeightMm: { type: 'number' },
    style: choice(['upholstered', 'fluted', 'flat']),
    border: yesNo,
    path: choice(['cove', 'line']),
  },
};

export const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rooms'],
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['roomId', 'note', 'furniture', 'floor', 'wall', 'decor'],
        properties: {
          roomId: { type: 'string' },
          note: { type: 'string' },
          furniture: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['kind', 'productId'], properties: { kind: { type: 'string' }, productId: { type: 'integer' } } },
          },
          floor: { type: 'integer', description: '0 keeps the style default' },
          wall: { type: 'integer', description: '0 keeps the style default' },
          decor: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['family', 'referenceId', 'concept', 'anchor', 'wallIndex', 'widthM', 'heightFromM', 'heightToM', 'params', 'materials', 'note'],
              properties: {
                family: { type: 'string', enum: DECOR_FAMILY_LIST },
                referenceId: { type: 'string', description: '"" when none' },
                concept: { type: 'string' },
                anchor: { type: 'string', enum: [...DECOR_ANCHORS] },
                wallIndex: { type: 'integer', description: '-1 unless anchor is wall' },
                widthM: { type: 'number', description: '0 lets the engine size it' },
                heightFromM: { type: 'number', description: '-1 for the default' },
                heightToM: { type: 'number', description: '-1 for the default' },
                params: PARAMS_SCHEMA,
                materials: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['slot', 'productId', 'colorHex'],
                    properties: {
                      slot: { type: 'string', enum: ['face', 'backing', 'led', 'profile', 'body', 'shelf', 'surround', 'border', 'trim'] },
                      productId: { type: 'integer' },
                      colorHex: { type: 'string', description: '"" unless the material is tintable' },
                    },
                  },
                },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Checking the answer
// ---------------------------------------------------------------------------

interface RawDecor {
  family: string;
  referenceId: string;
  concept: string;
  anchor: string;
  wallIndex: number;
  widthM: number;
  heightFromM: number;
  heightToM: number;
  params: Record<string, string | number>;
  materials: Array<{ slot: string; productId: number; colorHex: string }>;
  note: string;
}

interface RawRoom {
  roomId: string;
  note: string;
  furniture: Array<{ kind: string; productId: number }>;
  floor: number;
  wall: number;
  decor: RawDecor[];
}

/** The answer's knobs with its sentinels ("auto", 0, -1) read as absent, its yes/no as booleans. */
function readParams(raw: Record<string, string | number> | undefined): DecorParams {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value === AUTO || value === '' || value == null) continue;
    if (value === 'yes' || value === 'no') out[key] = value === 'yes';
    else if (typeof value === 'number') {
      if (key === 'shelves' ? value >= 0 : value > 0) out[key] = value;
    } else out[key] = value;
  }
  return out as DecorParams;
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Keeps only what was offered: rooms of the plan, products from their room's kind lists, finishes
 * from the room's pools, decor of a known family with materials of a kind its slot takes and
 * references for this style. Throws when nothing usable is left — the caller falls back.
 */
export function validateProposal(raw: { rooms?: RawRoom[] }, plan: FloorPlan, offer: Offer, model: string): AiProposal {
  const roomIds = new Set(plan.rooms.map((r) => r.id));
  const rooms: AiRoomProposal[] = [];
  for (const room of raw.rooms ?? []) {
    if (!room || !roomIds.has(room.roomId)) continue;
    const kinds = offer.furniture.get(room.roomId) ?? new Map<string, Set<number>>();
    const furniture = (room.furniture ?? []).filter((f) => kinds.get(f.kind)?.has(f.productId));
    const floor = room.floor && offer.floors.get(room.roomId)?.has(room.floor) ? room.floor : null;
    const wall = room.wall && offer.walls.get(room.roomId)?.has(room.wall) ? room.wall : null;
    const decor: DecorIntent[] = [];
    for (const d of (room.decor ?? []).slice(0, 3)) {
      if (!d || !DECOR_FAMILY_LIST.includes(d.family as DecorFamily) || !(DECOR_ANCHORS as readonly string[]).includes(d.anchor)) continue;
      const family = d.family as DecorFamily;
      const materials = (d.materials ?? [])
        .filter((m) => {
          if (!m || !decorSlots(family).includes(m.slot as DecorSlot) || !m.productId) return false;
          const product = offer.decorMaterials.get(m.productId);
          return !!product && slotTakes(family, m.slot as DecorSlot, decorMaterialKind(product));
        })
        .map((m) => ({ slot: m.slot as DecorSlot, productId: m.productId, colorHex: /^#[0-9a-f]{6}$/i.test(m.colorHex ?? '') ? m.colorHex : null }));
      decor.push({
        family,
        referenceId: d.referenceId && offer.referenceIds.has(d.referenceId) ? d.referenceId : null,
        concept: text(d.concept, 120),
        anchor: d.anchor as DecorIntent['anchor'],
        wallIndex: typeof d.wallIndex === 'number' && d.wallIndex >= 0 ? d.wallIndex : null,
        widthM: typeof d.widthM === 'number' && d.widthM > 0 ? d.widthM : null,
        heightFromM: typeof d.heightFromM === 'number' && d.heightFromM >= 0 ? d.heightFromM : null,
        heightToM: typeof d.heightToM === 'number' && d.heightToM > 0 ? d.heightToM : null,
        params: readParams(d.params),
        materials,
        note: text(d.note, 400),
      });
    }
    rooms.push({ roomId: room.roomId, note: text(room.note, 1200), furniture, floor, wall, decor });
  }
  if (rooms.length === 0) throw new Error('The designer returned no usable room');
  return { model, rooms };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/** List prices, US dollars per million tokens: what a generation costs, logged with it. */
const PRICE_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

export async function designWithClaude(request: AiDesignRequest): Promise<{ proposal: AiProposal; usage: AiDesignUsage }> {
  const apiKey = request.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  const model = request.model ?? DESIGN_MODEL;
  const { text, offer, seed } = buildBrief(request);
  const client = new Anthropic({ apiKey });
  const started = Date.now();

  // Streamed to keep a long answer clear of the HTTP timeout; used whole. The rules part of the
  // prompt is cached: every generation shares it.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: DESIGN_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: `Design this flat.\n${text}` }] }],
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('The designer declined');
  if (response.stop_reason === 'max_tokens') throw new Error('The designer ran out of room');
  const block = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!block) throw new Error(`The designer returned nothing (stop_reason: ${response.stop_reason})`);

  const proposal = validateProposal(JSON.parse(block.text) as { rooms?: RawRoom[] }, request.plan, offer, response.model);
  const u = response.usage;
  const price = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK[DESIGN_MODEL];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const costUsd = (u.input_tokens * price.input + u.output_tokens * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) / 1_000_000;
  return {
    proposal,
    usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, durationMs: Date.now() - started, model: response.model, costUsd: Math.round(costUsd * 10000) / 10000, seed },
  };
}
