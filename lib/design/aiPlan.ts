/**
 * Reading a floor plan with Claude.
 *
 * The division of labour matters here. The model is asked for the things it is genuinely good
 * at — what the rooms are called, which type each is, roughly where each sits and what shape it
 * is, what the dimension labels *say*, and where the doors, windows and open connections are.
 * It is deliberately **not** trusted for precise coordinates, because a vision model returns
 * those a few percent out and nothing downstream can tell. Three things make the geometry
 * exact instead:
 *
 *   - the drawing's own ink (`planInk`): each box side is pinned onto the wall band the image
 *     shows next to it, doors and windows onto the gaps in the wall;
 *   - the printed dimensions (`planSolver`): wall lines solved so every label holds;
 *   - one grid (`planGrid`): overlapping boxes resolved, slivers filled, and the walls — and the
 *     room separators where rooms open onto each other — built straight from the cells.
 *
 * This module is pure apart from the one API call: the prompt, the schema and the conversion
 * are all testable without a key, and `readPlanWithClaudeDetailed` is the only function that
 * talks to the network.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RoomType } from '@/lib/calculator/types';
import { DEFAULT_CEILING_M, ROOM_TYPES } from '@/lib/calculator/constants';
import { detectUnitSystem, parseLength } from './measure';
import { DEFAULT_WALL_M, solvePlan, type InkEdge, type NormBox, type PrintedDimension, type RoughRoom, type SolveResult } from './planSolver';
import { assignCells, boundaryRuns, roomAnchor, wallsFromRuns, type BoundaryRun, type Grid } from './planGrid';
import { bareRuns, gapsAlong, inkShare, wallBandNear, type InkImage, type LineStretch } from './planInk';
import { alongEdge, deriveOpenings, pointInPolygon, pointOnEdge, roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { OPENING_DEFAULTS, cornerMargin, holdsRailings, mirrorHinge, mirrorSwing, projectToEdge } from './openings';
import { roomsFromWalls, splitAtJunctions, withBounds } from './walls';
import { withRoomNames } from './roomNames';
import type { FloorPlan, Opening, OpeningKind, PlanRoom, Vec2, Wall } from './types';

export const PLAN_MODEL = 'claude-opus-5-5';

const ROOM_TYPE_VALUES = Object.keys(ROOM_TYPES) as RoomType[];

// ---------------------------------------------------------------------------
// What we ask the model for
// ---------------------------------------------------------------------------

export type PlanSide = 'top' | 'bottom' | 'left' | 'right';
const SIDES: readonly PlanSide[] = ['top', 'bottom', 'left', 'right'];

/** A point on the drawing, normalised: x a fraction of its width, y of its height, from the top-left. */
export interface AiPoint {
  x: number;
  y: number;
}

/** One rectangle of a room's floor, inner face of wall to inner face of wall, normalised. */
export interface AiRoomPart {
  box: NormBox;
  /** The dimension printed for this rectangle's horizontal extent, exactly as printed. Null when unlabelled. */
  widthLabel: string | null;
  depthLabel: string | null;
}

export interface AiRoom {
  name: string;
  type: RoomType;
  /** The rectangles that together are the room's floor: one for a rectangular room, two for an L. */
  parts: AiRoomPart[];
}

/** `open`: no wall at all between two rooms (a room separator); `railing`: a balcony's open side. */
export type AiOpeningKind = 'door' | 'window' | 'archway' | 'open' | 'railing';
const OPENING_KINDS: readonly AiOpeningKind[] = ['door', 'window', 'archway', 'open', 'railing'];

export interface AiOpening {
  kind: AiOpeningKind;
  /** Room names, matching `AiRoom.name`. `roomB` is null for the outside. */
  roomA: string;
  roomB: string | null;
  /** Which side of `roomA`'s outline the opening is in, as the image is drawn. */
  side: PlanSide;
  /** The opening's two ends on the wall. */
  from: AiPoint;
  to: AiPoint;
  widthLabel: string | null;
  /** Doors: the point the drawn swing arc pivots on. */
  hinge: AiPoint | null;
  /** Doors: the room the leaf swings into; null when it swings outside. */
  swingsInto: string | null;
}

/**
 * A dimension line on the drawing — a size between two arrows or ticks, usually chained outside
 * the plan — as opposed to a size written inside a room (`AiRoomPart.widthLabel`).
 */
export interface AiDimension {
  label: string;
  /** `across` measures left to right, `down` top to bottom. */
  axis: 'across' | 'down';
  /** Its two ends along that axis (x for across, y for down), normalised. */
  from: number;
  to: number;
  /** Where the dimension line is drawn on the other axis (its y for across, its x for down). */
  at: number;
}

export interface AiPlanReading {
  unitSystem: 'imperial' | 'metric';
  rooms: AiRoom[];
  openings: AiOpening[];
  /** Absent in readings recorded before dimension lines were read on their own. */
  dimensions?: AiDimension[];
  /** The model's own note about anything ambiguous. Surfaced to the user, not acted on. */
  notes: string | null;
}

const POINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y'],
  properties: { x: { type: 'number' }, y: { type: 'number' } },
} as const;

/**
 * The shape the model answers in (structured outputs), so the conversion below never has to
 * defend against a missing field — only against a *wrong* one, which is a different problem.
 */
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['unitSystem', 'rooms', 'openings', 'dimensions', 'notes'],
  properties: {
    unitSystem: { type: 'string', enum: ['imperial', 'metric'], description: 'Which units the drawing is annotated in.' },
    rooms: {
      type: 'array',
      description: 'Every room and space of the flat, including hallways, closets and balconies.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'type', 'parts'],
        properties: {
          name: { type: 'string', description: 'The label printed on the plan, verbatim; a short description of the space when it has none.' },
          type: { type: 'string', enum: ROOM_TYPE_VALUES },
          parts: {
            type: 'array',
            description: 'Rectangles that together are exactly the room floor: one for a rectangular room, two for an L shape.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['box', 'widthLabel', 'depthLabel'],
              properties: {
                box: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x0', 'y0', 'x1', 'y1'],
                  description: 'The rectangle from the inner face of one wall to the inner face of the opposite wall, on the ruler.',
                  properties: { x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' } },
                },
                widthLabel: { type: ['string', 'null'], description: 'A size written inside the room (or in a table of rooms) for this rectangle across (left to right), copied exactly. Null if none. Never a dimension line.' },
                depthLabel: { type: ['string', 'null'], description: 'A size written inside the room (or in a table of rooms) for this rectangle down (top to bottom), copied exactly. Null if none. Never a dimension line.' },
              },
            },
          },
        },
      },
    },
    openings: {
      type: 'array',
      description: 'Every door, window, archway, open connection and balcony railing, each once.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'roomA', 'roomB', 'side', 'from', 'to', 'widthLabel', 'hinge', 'swingsInto'],
        properties: {
          kind: { type: 'string', enum: OPENING_KINDS },
          roomA: { type: 'string', description: 'The room the opening is read from (a name from rooms).' },
          roomB: { type: ['string', 'null'], description: 'The room on the other side, or null for the outside.' },
          side: { type: 'string', enum: SIDES, description: 'Which side of roomA the opening is on, as the image is drawn.' },
          from: { ...POINT_SCHEMA, description: 'One end of the opening, on the wall, on the ruler.' },
          to: { ...POINT_SCHEMA, description: 'The other end, on the ruler.' },
          widthLabel: { type: ['string', 'null'], description: 'A width printed for the opening, copied exactly; usually null.' },
          hinge: { anyOf: [POINT_SCHEMA, { type: 'null' }], description: 'Doors: the point the swing arc pivots on. Null for anything else.' },
          swingsInto: { type: ['string', 'null'], description: 'Doors: the room the leaf swings into, null when it swings outside or for anything else.' },
        },
      },
    },
    dimensions: {
      type: 'array',
      description: 'Every dimension line of the drawing — each segment of a chain and each overall size — once.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'axis', 'from', 'to', 'at'],
        properties: {
          label: { type: 'string', description: 'The size exactly as printed.' },
          axis: { type: 'string', enum: ['across', 'down'], description: 'across: it measures left to right; down: top to bottom.' },
          from: { type: 'number', description: 'Where one end (arrow or tick) is along its axis, on the ruler: an x for across, a y for down.' },
          to: { type: 'number', description: 'Where the other end is along its axis, on the ruler.' },
          at: { type: 'number', description: 'Where the dimension line itself is drawn on the other axis, on the ruler: its y for across, its x for down.' },
        },
      },
    },
    notes: { type: ['string', 'null'], description: 'Anything ambiguous or unreadable worth telling the user about.' },
  },
} as const;

const SYSTEM_PROMPT = `You read architectural floor plans for a home-design tool that rebuilds them in 3D, wall for wall, so every room, wall, door and window has to come out where the drawing has it. Work through the drawing carefully before answering.

**Coordinates.** The image you get carries a blue ruler that is not part of the plan: dashed lines at every tenth of the drawing, numbered 0.0 to 1.0 along the top (x, left to right) and down the left side (y, top to bottom). Give every coordinate on that ruler, to two decimals, interpolating between the lines. When the image has no ruler, give fractions of the image's width and height.

1. **Rooms.** Report every room and space of the flat: rooms, kitchens, bathrooms, toilets, hallways and corridors, closets, storage, balconies and terraces. A space with a label is a room; an unlabelled corridor or entrance hall the doors open off is a room too (a hallway). Do not merge two rooms because the wall between them is thin, do not split a room because furniture stands in it, and do not invent a room where there is only furniture. One space labelled as two things at once ("Living Room and Kitchen", "Kitchen-Dining-Living") is one room of type studio.

2. **Room shape.** Give each room as rectangles ("parts") that together cover exactly its floor, from the inner face of one wall to the inner face of the opposite one. A rectangular room is one part. An L-shaped room is two parts — the main body, then the leg that sticks out — a T or U shape three. Parts must not overlap each other, within a room or between rooms. Where two rooms share a wall, their edges sit either side of that same wall; where a room opens onto another with no wall, their edges meet on the line where one ends and the other begins.

3. **Dimensions.** These are the only exact numbers on the drawing. Copy each one exactly as printed — "18' 3\\"" not "18.25 ft", "3,50" not "3.5", "3.5 м", "350". There are two kinds, reported in different places:
   - A **dimension line**: a size between two arrows or tick marks, with extension lines running to the walls — usually chained along the outside of the plan, often with an overall size beyond the chain. Report every one in dimensions: each segment of a chain on its own, and the overall too. axis is across when it measures left to right, down when top to bottom; from and to are where its two ends are along that axis on the ruler (x for across, y for down) — where the arrows or ticks are, which is where the extension lines meet the walls; at is where the dimension line itself is drawn on the other axis (its y for across, its x for down). Do not attach these to rooms.
   - A **size written in a room** (or in a table of rooms by name) with no dimension line — "3.50 x 4.20", "Bed 01: 3.5 x 3.0m": that room's clear inside size. Put it on the room's part, widthLabel for across and depthLabel for down, matching the two numbers to the room's shape.
   An area (m², sq ft) is not a dimension.

4. **Openings.** Every door, window, archway, open connection and balcony railing, each once:
   - door: a leaf with its swing arc. hinge is the point the arc pivots on (the corner of the opening the leaf hangs from); swingsInto is the room the leaf swings into, null when it swings outside.
   - window: thin parallel lines across an outer wall, or a wall onto a balcony.
   - archway: a gap in a wall between two rooms with no door in it. A gap in an outer wall that leads out of the flat is its entrance: report it as a door.
   - open: two rooms with no wall between them at all — an open-plan kitchen and living room, a hallway running straight into the living room. from and to are the ends of the stretch where nothing stands.
   - railing: a balcony's open side, drawn as a thin line or railing instead of a wall.
   For each: roomA is the room it belongs to (for one between two rooms, either), roomB the room on the other side or null for the outside, side which side of roomA's outline it is in as the image is drawn, from and to its two ends on the wall.

5. **Ignore** furniture, fixtures, plants, hatching, text, the ruler and dimension arrows — they are drawn on the plan but they are not walls.

Room type must be one of: ${ROOM_TYPE_VALUES.join(', ')}. Map an unusual label to the closest fit — a "study" is an office, a "WC" is a toilet, a "terrace" or "loggia" is a balcony, a "corridor" or "entry" is a hallway.

If the drawing has no dimension labels at all, still report the rooms and say so in the notes.`;

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface AiPlanRequest {
  imageBase64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  /** Whether the image carries the coordinate ruler (`planVision.prepareForVision`). */
  ruler?: boolean;
  /** Another model than `PLAN_MODEL` — for comparing models on the same plans (`plan:ai --model`). */
  model?: string;
  /** Overrides the env key, for testing. */
  apiKey?: string;
}

/** What one call cost and how long it took — logged per read so the bill is explainable. */
export interface AiPlanUsage {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  model: string;
}

/** Anthropic rejects images over this many bytes; the route downsizes before sending. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Longest edge the API keeps before downscaling itself; sending more only costs upload time. */
export const MAX_IMAGE_EDGE_PX = 1568;

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not configured');
    this.name = 'MissingApiKeyError';
  }
}

export async function readPlanWithClaude(request: AiPlanRequest): Promise<AiPlanReading> {
  return (await readPlanWithClaudeDetailed(request)).reading;
}

/** Same call, with the usage figures alongside the reading. */
export async function readPlanWithClaudeDetailed(request: AiPlanRequest): Promise<{ reading: AiPlanReading; usage: AiPlanUsage }> {
  const apiKey = request.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new Anthropic({ apiKey });
  const started = Date.now();

  // Streamed only to keep a long read clear of the HTTP timeout; the answer is used whole.
  const model = request.model ?? PLAN_MODEL;
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    // A refusal on a floor plan would be a false positive; the server retries it on another
    // model. Haiku has no server-side fallback.
    ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    // Reading a plan is a reasoning task, not a captioning one — which room a dimension
    // belongs to, and which way a door swings, often takes working out.
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: request.mediaType, data: request.imageBase64 } },
          {
            type: 'text',
            text: request.ruler === false
              ? 'Read this floor plan. This image has no ruler: give coordinates as fractions of its width and height.'
              : 'Read this floor plan. Give every coordinate on the blue ruler.',
          },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === 'refusal') throw new Error('The model declined to read the plan');
  const text = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text');
  if (!text) throw new Error(`Model returned no plan (stop_reason: ${response.stop_reason})`);

  return {
    reading: normaliseReading(JSON.parse(text.text) as AiPlanReading),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - started,
      model: response.model,
    },
  };
}

/**
 * Tidies a reading before geometry sees it. The schema guarantees the shape; this guards the
 * values — a box slightly outside the image, a box the model gave inverted, a blank label, a
 * room with no usable rectangle — so the solver never has to.
 */
export function normaliseReading(reading: AiPlanReading): AiPlanReading {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const label = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const point = (p: AiPoint | null | undefined): AiPoint | null => (p && typeof p === 'object' ? { x: clamp(p.x), y: clamp(p.y) } : null);

  const rooms = (reading.rooms ?? [])
    .filter((room) => room && typeof room.name === 'string')
    .map((room, index) => ({
      name: room.name.trim() || `Room ${index + 1}`,
      type: ROOM_TYPE_VALUES.includes(room.type) ? room.type : 'living_room',
      parts: (room.parts ?? [])
        .filter((part) => part && part.box)
        .map((part) => ({
          box: {
            x0: clamp(Math.min(part.box.x0, part.box.x1)),
            x1: clamp(Math.max(part.box.x0, part.box.x1)),
            y0: clamp(Math.min(part.box.y0, part.box.y1)),
            y1: clamp(Math.max(part.box.y0, part.box.y1)),
          },
          widthLabel: label(part.widthLabel),
          depthLabel: label(part.depthLabel),
        }))
        // A rectangle with no area is not floor the geometry can use.
        .filter((part) => part.box.x1 - part.box.x0 > 0.005 && part.box.y1 - part.box.y0 > 0.005),
    }))
    .filter((room) => room.parts.length > 0);

  const openings = (reading.openings ?? [])
    .filter((o) => o && typeof o.roomA === 'string' && OPENING_KINDS.includes(o.kind))
    .map((o) => {
      const from = point(o.from) ?? { x: 0, y: 0 };
      return {
        kind: o.kind,
        roomA: o.roomA.trim(),
        roomB: label(o.roomB),
        side: SIDES.includes(o.side) ? o.side : 'top',
        from,
        to: point(o.to) ?? from,
        widthLabel: label(o.widthLabel),
        hinge: point(o.hinge),
        swingsInto: label(o.swingsInto),
      } satisfies AiOpening;
    });

  const dimensions = (reading.dimensions ?? [])
    .filter((d) => d && typeof d.label === 'string' && d.label.trim() && Number.isFinite(d.from) && Number.isFinite(d.to))
    .map((d) => ({
      label: d.label.trim(),
      axis: d.axis === 'down' ? ('down' as const) : ('across' as const),
      from: clamp(Math.min(d.from, d.to)),
      to: clamp(Math.max(d.from, d.to)),
      at: Number.isFinite(d.at) ? d.at : 0,
    }))
    .filter((d) => d.to - d.from > 0.005);

  return { unitSystem: reading.unitSystem === 'imperial' ? 'imperial' : 'metric', rooms, openings, dimensions, notes: label(reading.notes) };
}

// ---------------------------------------------------------------------------
// Reading → FloorPlan
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** The drawing's ink (`planInk`), when the image is at hand: walls and gaps are read off it. */
  ink?: InkImage | null;
  imageUrl?: string | null;
  ceilingHeightM?: number;
}

export interface AiPlanResult {
  plan: FloorPlan;
  /** Largest gap between a printed dimension and the solved room, in metres. */
  worstResidualM: number;
  /** True when the drawing's own dimensions disagree enough to warrant a look. */
  lowConfidence: boolean;
  /** False when nothing printed gave the plan its size: the person is asked for one wall's length. */
  scaleKnown: boolean;
  notes: string | null;
  /** The solve behind the plan — for the `plan:ai` tool's overlay, not for the client. */
  solve: SolveResult;
}

/** A printed dimension in metres; a bare metric number is read in the unit its size implies (350 → cm, 3500 → mm). */
export function labelMetres(label: string | null, unitSystem: AiPlanReading['unitSystem']): number | null {
  if (!label) return null;
  const parsed = parseLength(label, unitSystem === 'imperial' ? 'ft' : 'm');
  if (!parsed || parsed.metres <= 0) return null;
  if (unitSystem === 'metric' && parsed.unit === 'm' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(label)) {
    const value = parsed.metres;
    if (value >= 1000) return value / 1000;
    if (value >= 100) return value / 100;
  }
  return parsed.metres;
}

/**
 * Converts a model reading into an exact `FloorPlan`, walls and all.
 *
 * Pure — no network — so the whole conversion can be tested against a recorded reading.
 */
export function buildPlanFromReading(reading: AiPlanReading, options: BuildOptions = {}): AiPlanResult {
  const ink = options.ink ?? null;
  const heightM = options.ceilingHeightM ?? DEFAULT_CEILING_M;

  // --- 1. every rectangle as a rough room, its sides pinned to the ink where it shows a wall ---
  const parts: Array<{ room: number; rough: RoughRoom }> = [];
  reading.rooms.forEach((room, r) => {
    room.parts.forEach((part, p) => {
      parts.push({
        room: r,
        rough: {
          id: `r${r + 1}p${p + 1}`,
          box: part.box,
          widthM: labelMetres(part.widthLabel, reading.unitSystem),
          depthM: labelMetres(part.depthLabel, reading.unitSystem),
          outdoor: room.type === 'balcony',
          ...(ink ? { ink: sideBands(ink, part.box) } : {}),
        },
      });
    });
  });
  if (ink) dropHairlines(parts.map((p) => p.rough));

  // --- 2. the wall lines every printed dimension agrees with ---
  const dimensions = (reading.dimensions ?? []).flatMap((d): PrintedDimension[] => {
    const metres = labelMetres(d.label, reading.unitSystem);
    return metres ? [{ axis: d.axis === 'across' ? 'x' : 'y', from: d.from, to: d.to, at: d.at, metres }] : [];
  });
  const solve = solvePlan(parts.map((p) => p.rough), { dimensions });
  const doubtful = new Set(
    solve.residuals.filter((r) => Math.abs(r.solved - r.target) > 0.08).map((r) => parts.find((p) => p.rough.id === r.roomId)!.room)
  );

  // --- 3. the rooms as cells of the grid ---
  const solvedById = new Map(solve.rooms.map((s) => [s.id, s.lines]));
  const grid = assignCells(
    solve.xLines,
    solve.yLines,
    reading.rooms.map((_, r) => ({
      parts: parts.filter((p) => p.room === r).map((p) => solvedById.get(p.rough.id)!),
    }))
  );

  // --- 4. the walls: every boundary, open where the rooms run into each other ---
  const resolver = roomResolver(reading, grid);
  const runs = boundaryRuns(grid);
  const thicknessOf = (run: Pick<BoundaryRun, 'orientation' | 'line'>) =>
    run.orientation === 'v' ? solve.xThickness[run.line] ?? DEFAULT_WALL_M : solve.yThickness[run.line] ?? DEFAULT_WALL_M;
  const openPairs = new Set<string>();
  const passagePairs = new Set<string>();
  for (const opening of reading.openings) {
    const at = solve.toPlan(midpoint(opening.from, opening.to));
    const a = resolver(opening.roomA, at);
    const b = opening.roomB ? resolver(opening.roomB, at) : -1;
    if (a < 0 || b < 0 || a === b) continue;
    if (opening.kind === 'open') openPairs.add(pairKey(a, b));
    if (opening.kind === 'door' || opening.kind === 'archway') passagePairs.add(pairKey(a, b));
  }
  const walls = splitAtJunctions(
    wallsFromRuns(runs, thicknessOf, (run) => openStretches(run, { ink, solve, thicknessOf, openPairs, passagePairs }))
  );

  // --- 5. the rooms those walls enclose, each given back its reading ---
  const faces = roomsFromWalls(walls, { defaultThicknessM: DEFAULT_WALL_M, defaultHeightM: heightM });
  const byIndex = new Map<number, PlanRoom>();
  const used = new Set<PlanRoom>();
  reading.rooms.forEach((room, r) => {
    const anchor = roomAnchor(grid, r);
    const face = anchor ? faces.find((f) => !used.has(f) && pointInPolygon(anchor, f.polygon)) : undefined;
    if (!face) return;
    used.add(face);
    face.id = `r${r + 1}`;
    face.name = room.name;
    face.type = room.type;
    face.heightM = heightM;
    if (doubtful.has(r)) face.lowConfidence = true;
    byIndex.set(r, face);
  });
  // A face no reading room claims is a pocket the walls closed by themselves; it keeps the type
  // its size suggests rather than vanishing, since the walls around it are real.
  let extra = reading.rooms.length;
  const rooms = faces.map((face) => {
    if (!used.has(face)) face.id = `r${++extra}`;
    return face;
  });

  // --- 6. doors, windows and railings where the drawing has them; inference only for the rest ---
  const wallById = new Map(walls.map((w) => [w.id, w]));
  placeReadOpenings(rooms, reading, { byIndex, resolver, solve, ink, wallById });
  inferMissingOpenings(rooms, reading, walls);

  const worstResidualM = [...solve.residuals, ...solve.dimensionResiduals].reduce((max, r) => Math.max(max, Math.abs(r.solved - r.target)), 0);
  const plan = withBounds({
    // The labels are the drawing's own; a type's bare name printed on more than one room
    // ("საძინებელი" twice) is numbered, and one printed with a number on a lone room loses it.
    rooms: withRoomNames(rooms),
    walls,
    metresPerPixel: null,
    bounds: { width: 0, depth: 0 },
    source: 'parsed',
    imageUrl: options.imageUrl ?? null,
    wallThicknessM: DEFAULT_WALL_M,
  });

  return { plan, worstResidualM, lowConfidence: solve.lowConfidence, scaleKnown: solve.scaleKnown, notes: reading.notes, solve };
}

/** The wall bands the ink shows along a rectangle's four sides. */
function sideBands(ink: InkImage, box: NormBox): RoughRoom['ink'] {
  const reachX = (box.x1 - box.x0) * 0.4;
  const reachY = (box.y1 - box.y0) * 0.4;
  const band = (orientation: 'h' | 'v', at: number, from: number, to: number, reach: number): InkEdge | null => {
    const found = wallBandNear(ink, { orientation, at, from, to, reach });
    return found ? { centre: found.centre, thickness: found.thickness } : null;
  };
  return {
    x0: band('v', box.x0, box.y0, box.y1, reachX),
    x1: band('v', box.x1, box.y0, box.y1, reachX),
    y0: band('h', box.y0, box.x0, box.x1, reachY),
    y1: band('h', box.y1, box.x0, box.x1, reachY),
  };
}

/**
 * Holds the bands to the drawing's own walls. Next to an open boundary there is no wall to find,
 * and the heaviest ink near it can be the hairline of a sofa or a rug: a band under half the
 * typical wall is that, and is forgotten. The other way, a hatched counter or a filled cupboard
 * drawn against a wall merges with it into one band several walls thick (an exterior wall is
 * often twice a partition, never this): the wall is the band's outer part, so its outer face
 * stays and it takes the typical thickness.
 */
function dropHairlines(rough: RoughRoom[]): void {
  const sides = ['x0', 'x1', 'y0', 'y1'] as const;
  const thicknesses = rough.flatMap((r) => sides.flatMap((side) => (r.ink?.[side] ? [r.ink[side]!.thickness] : [])));
  if (thicknesses.length < 3) return;
  const typical = [...thicknesses].sort((a, b) => a - b)[Math.floor(thicknesses.length / 2)];
  for (const r of rough) {
    for (const side of sides) {
      const band = r.ink?.[side];
      if (!band) continue;
      if (band.thickness < typical * 0.5) r.ink![side] = null;
      else if (band.thickness > typical * 2.6) {
        // The room lies on the + side of an x0/y0 band and the − side of an x1/y1 one.
        const outward = side === 'x0' || side === 'y0' ? -1 : 1;
        const outer = band.centre + (outward * band.thickness) / 2;
        r.ink![side] = { centre: outer - (outward * typical) / 2, thickness: typical };
      }
    }
  }
}

function midpoint(a: AiPoint, b: AiPoint): AiPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * A room named in an opening, by index: the room of that name, or — when the drawing has two
 * "Bedroom"s — the one of them nearest to where the opening is. −1 when no room is called that.
 */
function roomResolver(reading: AiPlanReading, grid: Grid): (name: string, near: Vec2) => number {
  const anchors = reading.rooms.map((_, r) => roomAnchor(grid, r));
  const norm = (s: string) => s.trim().toLowerCase();
  return (name, near) => {
    let candidates = reading.rooms.flatMap((room, r) => (room.name === name ? [r] : []));
    if (candidates.length === 0) candidates = reading.rooms.flatMap((room, r) => (norm(room.name) === norm(name) ? [r] : []));
    candidates = candidates.filter((r) => anchors[r]);
    if (candidates.length <= 1) return candidates[0] ?? -1;
    return candidates.sort((p, q) => Math.hypot(anchors[p]!.x - near.x, anchors[p]!.z - near.z) - Math.hypot(anchors[q]!.x - near.x, anchors[q]!.z - near.z))[0];
  };
}

/** A boundary run as a stretch of line on the image, for the ink questions. */
function runStretch(run: Pick<BoundaryRun, 'orientation' | 'at' | 'from' | 'to'>, solve: SolveResult): LineStretch {
  if (run.orientation === 'v') {
    const a = solve.toImage({ x: run.at, z: run.from });
    const b = solve.toImage({ x: run.at, z: run.to });
    return { orientation: 'v', at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) };
  }
  const a = solve.toImage({ x: run.from, z: run.at });
  const b = solve.toImage({ x: run.to, z: run.at });
  return { orientation: 'h', at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) };
}

/**
 * Where along a boundary between two rooms there is no wall (metres along the line).
 *
 * With the image at hand the ink decides: rooms the model said are open onto each other are
 * open wherever the line is bare, and a boundary the model said nothing about is open when it
 * is bare along all of it (a hallway running into a living room) or along more than a doorway's
 * width with no door read there. Without the image, the model's word is all there is.
 */
function openStretches(
  run: BoundaryRun,
  context: {
    ink: InkImage | null;
    solve: SolveResult;
    thicknessOf: (run: Pick<BoundaryRun, 'orientation' | 'line'>) => number;
    openPairs: Set<string>;
    passagePairs: Set<string>;
  }
): Array<[number, number]> {
  const { ink, solve, thicknessOf, openPairs, passagePairs } = context;
  const key = pairKey(run.a, run.b);
  const declared = openPairs.has(key);
  const length = run.to - run.from;
  const whole: Array<[number, number]> = [[run.from, run.to]];
  if (!ink) return declared ? whole : [];

  const stretch = runStretch(run, solve);
  const scale = run.orientation === 'v' ? solve.initialScale.x : solve.initialScale.y;
  const across = run.orientation === 'v' ? ink.width : ink.height;
  const halfWidth = thicknessOf(run) / scale / 2 + 2 / across;
  const toMetres = (spans: Array<{ from: number; to: number }>): Array<[number, number]> =>
    spans.map((s) => [run.from + s.from * length, run.from + s.to * length]);

  const share = inkShare(ink, stretch, halfWidth);
  if (declared) {
    const bare = toMetres(bareRuns(ink, stretch, halfWidth, Math.min(1, 0.5 / Math.max(length, 0.01))));
    if (bare.length > 0) return bare;
    return share < 0.5 ? whole : [];
  }
  if (share < 0.12 && length >= 0.9 && !passagePairs.has(key)) return whole;
  if (passagePairs.has(key)) return [];
  return toMetres(bareRuns(ink, stretch, halfWidth, Math.min(1, 1.3 / Math.max(length, 0.01))));
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

const PRIORITY: Record<Exclude<AiOpeningKind, 'open'>, number> = { door: 0, archway: 1, railing: 2, window: 3 };

interface PlacementContext {
  byIndex: Map<number, PlanRoom>;
  resolver: (name: string, near: Vec2) => number;
  solve: SolveResult;
  ink: InkImage | null;
  wallById: Map<string, Wall>;
}

/**
 * The doors, windows, archways and railings the drawing shows, on the walls they are in.
 *
 * Each is put on the wall of its room on the side the model named, nearest to where it was
 * read (another wall of the room only when that side has none near); between two rooms, on the
 * stretch of wall they share. Where the image shows its walls solid, the opening then moves
 * onto the gap the drawing leaves in the wall — exact, where the model's reading is a few
 * percent out — and takes the gap's width. A door hangs from the jamb its arc pivots on and
 * swings the way the arc does. An opening between two rooms is cut in both, as one door's two
 * halves; the same opening read from both rooms is placed once.
 */
function placeReadOpenings(rooms: PlanRoom[], reading: AiPlanReading, context: PlacementContext): void {
  const { byIndex, resolver, solve, ink, wallById } = context;
  const thicknessBehind = (room: PlanRoom, edge: PlanEdge) => wallById.get(room.wallIds?.[edge.index] ?? '')?.thicknessM ?? DEFAULT_WALL_M;
  const usedGaps = new Set<string>();
  const placed: Array<{ kind: OpeningKind; a: string; b: string | null; centre: Vec2 }> = [];
  let serial = 0;

  const ordered = reading.openings
    .filter((o): o is AiOpening & { kind: Exclude<AiOpeningKind, 'open'> } => o.kind !== 'open')
    .sort((p, q) => PRIORITY[p.kind] - PRIORITY[q.kind]);

  for (const read of ordered) {
    const fromPlan = solve.toPlan(read.from);
    const toPlan = solve.toPlan(read.to);
    const mid = { x: (fromPlan.x + toPlan.x) / 2, z: (fromPlan.z + toPlan.z) / 2 };
    let room = byIndex.get(resolver(read.roomA, mid));
    let other = read.roomB ? byIndex.get(resolver(read.roomB, mid)) ?? null : null;
    if (!room) continue;
    if (other === room) other = null;

    // A balcony's railing belongs to the balcony, whichever room it was read from.
    if (read.kind === 'railing') {
      if (!holdsRailings(room) && other && holdsRailings(other)) room = other;
      if (!holdsRailings(room)) continue;
      other = null;
    }

    const choice = chooseEdge(room, other, read.side, mid, rooms, thicknessBehind);
    if (!choice) continue;
    const { edge } = choice;
    // The wall decides who is behind it, not the reading: a "window to the outside" in the wall
    // onto the balcony opens onto the balcony.
    other = choice.behind;
    if (read.kind === 'railing' && other) continue;

    // A gap from the flat to the outside is its way in, whether or not a leaf is drawn in it.
    const kind: OpeningKind = read.kind === 'archway' && !other ? 'door' : read.kind;
    let along0 = alongEdge(edge, fromPlan);
    let along1 = alongEdge(edge, toPlan);
    if (along1 < along0) [along0, along1] = [along1, along0];
    let centre = (along0 + along1) / 2;
    let width = openingWidth(kind, along1 - along0, labelMetres(read.widthLabel, reading.unitSystem), edge.length);

    // The same opening read from both rooms is one opening.
    const world = pointOnEdge(edge, clamp01(centre / edge.length));
    const pair = (p: { a: string; b: string | null }) => (p.a === room!.id && p.b === (other?.id ?? null)) || (p.b === room!.id && p.a === (other?.id ?? null));
    if (placed.some((p) => p.kind === kind && pair(p) && Math.hypot(p.centre.x - world.x, p.centre.z - world.z) < Math.max(0.6, width / 2))) continue;

    // Onto the gap the drawing leaves in a solid wall.
    if (ink && kind !== 'railing') {
      const gap = nearestGap(ink, solve, room, edge, thicknessBehind(room, edge), kind, centre, usedGaps);
      if (gap) {
        centre = (gap.from + gap.to) / 2;
        width = openingWidth(kind, gap.to - gap.from, labelMetres(read.widthLabel, reading.unitSystem), edge.length);
      }
    }

    const margin = cornerMargin(kind);
    const t = projectToEdge(edge, pointOnEdge(edge, clamp01(centre / edge.length)), width, margin);
    if (overlapsOpening(room, edge.index, t, width, edge.length)) continue;

    const defaults = OPENING_DEFAULTS[kind];
    const hinge: Opening['hinge'] =
      kind === 'door' && read.hinge ? (alongEdge(edge, solve.toPlan(read.hinge)) < t * edge.length ? 'left' : 'right') : 'left';
    const intoOther = read.swingsInto != null && other != null && resolver(read.swingsInto, mid) === indexOf(byIndex, other);
    // A front door read with no arc swings in, as front doors do.
    const swing: Opening['swing'] = !other ? (read.swingsInto || !read.hinge ? 'in' : 'out') : intoOther ? 'out' : 'in';
    const primary: Opening = {
      id: `${room.id}-o${++serial}`,
      kind,
      wallIndex: edge.index,
      t,
      widthM: round2(width),
      heightM: kind === 'window' && room.type === 'bathroom' ? 0.8 : defaults.heightM,
      sillM: kind === 'window' && room.type === 'bathroom' ? 1.5 : defaults.sillM,
      roomId: room.id,
      connectsToRoomId: other?.id ?? null,
      exterior: !other,
      ...(kind === 'door' ? { hinge, swing } : {}),
      origin: 'existing',
    };
    const centreWorld = pointOnEdge(edge, t);

    if (other) {
      const twinEdge = facingEdge(other, edge, centreWorld, thicknessBehind(room, edge));
      if (!twinEdge) continue;
      const twinT = projectToEdge(twinEdge, centreWorld, width, margin);
      if (overlapsOpening(other, twinEdge.index, twinT, width, twinEdge.length)) continue;
      other.openings.push({
        ...primary,
        id: `${other.id}-${room.id}-d-${primary.id}`,
        wallIndex: twinEdge.index,
        t: twinT,
        roomId: other.id,
        connectsToRoomId: room.id,
        ...(kind === 'door' ? { hinge: mirrorHinge(hinge), swing: mirrorSwing(swing) } : {}),
      });
    }
    room.openings.push(primary);
    placed.push({ kind, a: room.id, b: other?.id ?? null, centre: centreWorld });
  }
}

function indexOf(byIndex: Map<number, PlanRoom>, room: PlanRoom): number {
  for (const [index, candidate] of byIndex) if (candidate === room) return index;
  return -1;
}

/** Which way into the room an edge on each side of the image faces. */
const INWARD: Record<PlanSide, Vec2> = {
  top: { x: 0, z: 1 },
  bottom: { x: 0, z: -1 },
  left: { x: 1, z: 0 },
  right: { x: -1, z: 0 },
};

/**
 * The wall of `room` an opening read at `point` is in: on the side the model named, nearest the
 * point — and, between two rooms, one the other room stands behind. A wall on another side
 * only when the named side has none within reach. Null when nothing is near enough.
 */
function chooseEdge(
  room: PlanRoom,
  other: PlanRoom | null,
  side: PlanSide,
  point: Vec2,
  rooms: PlanRoom[],
  thicknessBehind: (room: PlanRoom, edge: PlanEdge) => number
): { edge: PlanEdge; behind: PlanRoom | null } | null {
  const wanted = INWARD[side];
  let best: { edge: PlanEdge; behind: PlanRoom | null; score: number } | null = null;
  for (const edge of wallEdges(room)) {
    const near = closestAlong(edge, point);
    const distance = Math.hypot(point.x - near.x, point.z - near.z);
    if (distance > 1.5) continue;
    const t = thicknessBehind(room, edge);
    const behind = rooms.find((r) => r !== room && facingEdge(r, edge, near, t)) ?? null;
    const onSide = edge.inward.x * wanted.x + edge.inward.z * wanted.z > 0.9;
    const score =
      distance +
      (onSide ? 0 : 0.6) +
      (other ? (behind === other ? 0 : 0.8) : behind ? 0.3 : 0);
    if (!best || score < best.score) best = { edge, behind, score };
  }
  return best ? { edge: best.edge, behind: best.behind } : null;
}

/** The point of `edge` nearest to `point`. */
function closestAlong(edge: PlanEdge, point: Vec2): Vec2 {
  const along = Math.max(0, Math.min(edge.length, alongEdge(edge, point)));
  return { x: edge.a.x + edge.dir.x * along, z: edge.a.z + edge.dir.z * along };
}

/**
 * The edge of `room` that is the other face of the wall `edge` is on, at `point`: parallel,
 * facing the other way, no further off than the wall is thick, and running past the point.
 */
function facingEdge(room: PlanRoom, edge: PlanEdge, point: Vec2, thickness: number): PlanEdge | null {
  for (const candidate of wallEdges(room)) {
    if (candidate.inward.x * edge.inward.x + candidate.inward.z * edge.inward.z > -0.95) continue;
    const off = Math.abs((point.x - candidate.a.x) * candidate.dir.z - (point.z - candidate.a.z) * candidate.dir.x);
    if (off > thickness + 0.05) continue;
    const along = alongEdge(candidate, point);
    if (along < -0.05 || along > candidate.length + 0.05) continue;
    return candidate;
  }
  return null;
}

/** An opening's width from what was read: a printed width, else the span read, held to what such an opening is. */
function openingWidth(kind: OpeningKind, span: number, printed: number | null, edgeLength: number): number {
  const room = Math.max(0.3, edgeLength - 2 * cornerMargin(kind));
  if (printed) return Math.min(printed, room);
  switch (kind) {
    case 'door':
      return Math.min(room, span >= 0.6 && span <= 1.3 ? span : 0.9);
    case 'window':
      return Math.min(room, span >= 0.4 ? span : OPENING_DEFAULTS.window.widthM);
    case 'archway':
      return Math.min(room, span >= 0.7 ? span : OPENING_DEFAULTS.archway.widthM);
    case 'railing':
      // A railing read along most of a balcony side is the whole side.
      return span >= edgeLength * 0.7 ? edgeLength : Math.min(edgeLength, Math.max(0.3, span));
  }
}

/**
 * The gap in the wall behind `edge` nearest to where an opening was read, metres along the edge
 * — or null when the drawing does not draw this wall solid, or no free gap is near. A window
 * takes a glazed gap before an empty one, a door or archway the other way round.
 */
function nearestGap(
  ink: InkImage,
  solve: SolveResult,
  room: PlanRoom,
  edge: PlanEdge,
  thickness: number,
  kind: OpeningKind,
  centre: number,
  used: Set<string>
): { from: number; to: number } | null {
  // The wall's centreline, half its thickness behind the room's face.
  const out = { x: -edge.inward.x * (thickness / 2), z: -edge.inward.z * (thickness / 2) };
  const a = solve.toImage({ x: edge.a.x + out.x, z: edge.a.z + out.z });
  const b = solve.toImage({ x: edge.b.x + out.x, z: edge.b.z + out.z });
  const horizontal = edge.axis === 'x';
  const stretch: LineStretch = horizontal
    ? { orientation: 'h', at: (a.y + b.y) / 2, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) }
    : { orientation: 'v', at: (a.x + b.x) / 2, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) };
  const scale = horizontal ? solve.initialScale.y : solve.initialScale.x;
  const gaps = gapsAlong(ink, stretch, thickness / scale, Math.min(1, 0.4 / Math.max(edge.length, 0.01)));
  if (!gaps) return null;

  let best: { from: number; to: number; cost: number; key: string } | null = null;
  for (const gap of gaps) {
    // Back from the image onto the edge.
    const p = (f: number) =>
      solve.toPlan(horizontal ? { x: stretch.from + f * (stretch.to - stretch.from), y: stretch.at } : { x: stretch.at, y: stretch.from + f * (stretch.to - stretch.from) });
    let from = alongEdge(edge, p(gap.from));
    let to = alongEdge(edge, p(gap.to));
    if (to < from) [from, to] = [to, from];
    from = Math.max(0, from);
    to = Math.min(edge.length, to);
    if (to - from < 0.3) continue;
    const world = pointOnEdge(edge, clamp01((from + to) / 2 / edge.length));
    const key = `${Math.round(world.x * 10)}:${Math.round(world.z * 10)}`;
    if (used.has(key)) continue;
    const mismatch = (kind === 'window') !== (gap.kind === 'glazed');
    const cost = Math.abs((from + to) / 2 - centre) + (mismatch ? 0.8 : 0);
    if (cost <= 1.8 && (!best || cost < best.cost)) best = { from, to, cost, key };
  }
  if (!best) return null;
  used.add(best.key);
  return { from: best.from, to: best.to };
}

/** Whether an opening at `t` on a wall would overlap one already there. */
function overlapsOpening(room: PlanRoom, wallIndex: number, t: number, width: number, length: number): boolean {
  const lo = t * length - width / 2;
  const hi = t * length + width / 2;
  return room.openings.some((o) => {
    if (o.wallIndex !== wallIndex) return false;
    const c = o.t * length;
    return lo < c + o.widthM / 2 - 0.02 && hi > c - o.widthM / 2 + 0.02;
  });
}

/**
 * What the drawing did not show, inferred (`deriveOpenings`) — only where it is needed: a plan
 * read with no openings at all gets the whole inference; otherwise a flat with no way in gets
 * the inferred front door, a room nothing leads to gets the inferred door to it, and a plan
 * read with no windows at all gets the inferred windows.
 */
function inferMissingOpenings(rooms: PlanRoom[], reading: AiPlanReading, walls: Wall[]): void {
  const thickest = walls.reduce((max, w) => Math.max(max, w.thicknessM), DEFAULT_WALL_M);
  const inferred = rooms.map((r) => ({ ...r, openings: r.openings.filter((o) => o.kind === 'railing') }));
  deriveOpenings(inferred, thickest);
  const inferredOf = (room: PlanRoom) => inferred.find((r) => r.id === room.id)!.openings;

  const readAny = rooms.some((r) => r.openings.some((o) => o.kind !== 'railing'));
  if (!readAny) {
    for (const room of rooms) room.openings = [...room.openings, ...inferredOf(room).filter((o) => o.kind !== 'railing')];
    return;
  }

  const add = (room: PlanRoom, opening: Opening): boolean => {
    const edge = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
    if (!edge || overlapsOpening(room, opening.wallIndex, opening.t, opening.widthM, edge.length)) return false;
    room.openings.push(opening);
    return true;
  };

  // A way into the flat.
  if (!rooms.some((r) => r.openings.some((o) => o.kind === 'door' && o.exterior))) {
    for (const room of rooms) for (const o of inferredOf(room)) if (o.kind === 'door' && o.exterior) add(room, o);
  }

  // Every room reached from the way in — through a door, an archway or across a separator.
  const separatorRooms = new Map<string, PlanRoom[]>();
  for (const room of rooms) {
    for (const index of room.open ?? []) {
      const id = room.wallIds?.[index];
      if (id) separatorRooms.set(id, [...(separatorRooms.get(id) ?? []), room]);
    }
  }
  const neighbours = (room: PlanRoom): PlanRoom[] => {
    const out = new Set<PlanRoom>();
    for (const o of room.openings) {
      if (o.kind === 'window' || o.kind === 'railing' || !o.connectsToRoomId) continue;
      const other = rooms.find((r) => r.id === o.connectsToRoomId);
      if (other) out.add(other);
    }
    for (const index of room.open ?? []) for (const other of separatorRooms.get(room.wallIds?.[index] ?? '') ?? []) if (other !== room) out.add(other);
    return [...out];
  };
  const reached = (): Set<PlanRoom> => {
    const starts = rooms.filter((r) => r.openings.some((o) => o.kind === 'door' && o.exterior));
    const seen = new Set<PlanRoom>(starts.length > 0 ? starts : rooms.slice(0, 1));
    const queue = [...seen];
    while (queue.length) for (const next of neighbours(queue.shift()!)) if (!seen.has(next)) (seen.add(next), queue.push(next));
    return seen;
  };
  for (let pass = 0; pass < rooms.length; pass++) {
    const seen = reached();
    const cut = rooms.find((r) => !seen.has(r) && inferredOf(r).some((o) => o.connectsToRoomId && o.kind !== 'window'));
    if (!cut) break;
    // Its inferred door — towards a room already reached when there is one.
    const doors = inferredOf(cut).filter((o) => o.connectsToRoomId && o.kind !== 'window');
    const door = doors.find((o) => [...seen].some((r) => r.id === o.connectsToRoomId)) ?? doors[0];
    const other = rooms.find((r) => r.id === door.connectsToRoomId)!;
    const twin = inferredOf(other).find((o) => o.connectsToRoomId === cut.id && o.kind === door.kind);
    if (!add(cut, door)) break;
    if (twin) add(other, twin);
  }

  // Windows, when the drawing showed none.
  if (!reading.openings.some((o) => o.kind === 'window')) {
    for (const room of rooms) for (const o of inferredOf(room)) if (o.kind === 'window') add(room, o);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export { detectUnitSystem };
