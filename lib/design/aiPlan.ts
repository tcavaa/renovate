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
 *   - the printed dimensions (`planSolver`): wall lines solved so every label holds — and the
 *     areas printed in the rooms (`planAreas`): the scale of a drawing with no length on it, and
 *     every room fitted to its own;
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
import { detectUnitSystem, parseArea, parseLength } from './measure';
import { DEFAULT_WALL_M, solvePlan, withLines, type InkEdge, type NormBox, type PrintedDimension, type RoughRoom, type SolveResult } from './planSolver';
import { SOLID, assignCells, boundaryRuns, ownerAt, roomAnchor, wallsFromRuns, type BoundaryRun, type Grid } from './planGrid';
import { MAX_AREA_DRIFT, areaStep, squeezedPairs } from './planAreas';
import { bareRuns, blockBox, gapsAlong, inkShare, wallBandNear, withoutInk, type InkImage, type LineStretch } from './planInk';
import { alongEdge, deriveOpenings, pointInPolygon, pointOnEdge, polygonAreaM2, polygonCentroid, roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { OPENING_DEFAULTS, cornerMargin, holdsRailings, mirrorHinge, mirrorSwing, projectToEdge } from './openings';
import { roomsFromWalls, splitAtJunctions, withBounds } from './walls';
import { nextRoomName, withRoomNames } from './roomNames';
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
  /** What the reading calls the room — the openings name rooms by it. */
  name: string;
  /**
   * The room's label as the drawing prints it; null when the drawing prints none (the room is
   * then called what it is, in Georgian like every room the app names). Absent in older
   * readings, where `name` was both.
   */
  printedName?: string | null;
  type: RoomType;
  /** The rectangles that together are the room's floor: one for a rectangular room, two for an L. */
  parts: AiRoomPart[];
  /** The floor area printed in the room ("10.8 m²"), exactly as printed. Absent in older readings. */
  areaLabel?: string | null;
}

/** A solid block that is not floor — a column, a shaft, a duct, a chimney — as its own rectangle. */
export interface AiVoid {
  box: NormBox;
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
  /** Absent in readings recorded before solid blocks were read. */
  voids?: AiVoid[];
  /** The area of the whole flat as the drawing prints it ("54.6 m²"). Absent in older readings. */
  totalAreaLabel?: string | null;
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
const BOX_PROPERTIES = { x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' } } as const;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['unitSystem', 'rooms', 'voids', 'openings', 'dimensions', 'totalAreaLabel', 'notes'],
  properties: {
    unitSystem: { type: 'string', enum: ['imperial', 'metric'], description: 'Which units the drawing is annotated in.' },
    rooms: {
      type: 'array',
      description: 'Every room and space of the flat, including hallways, closets and balconies.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'printedName', 'type', 'areaLabel', 'parts'],
        properties: {
          name: { type: 'string', description: 'A name for this room, unique in this reading — its printed label, or a short description ("Bedroom 2") when it has none. Openings refer to rooms by this name.' },
          printedName: { type: ['string', 'null'], description: 'The room\'s name exactly as printed on the plan (not its area, not a number alone). Null when no name is printed in or for it.' },
          type: { type: 'string', enum: ROOM_TYPE_VALUES },
          areaLabel: { type: ['string', 'null'], description: 'The floor area printed in this room or beside its name ("10.8 m²", "116 sq ft"), copied exactly. Null if none. Never the area of the whole flat.' },
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
                  properties: BOX_PROPERTIES,
                },
                widthLabel: { type: ['string', 'null'], description: 'A size written inside the room (or in a table of rooms) for this rectangle across (left to right), copied exactly. Null if none. Never a dimension line.' },
                depthLabel: { type: ['string', 'null'], description: 'A size written inside the room (or in a table of rooms) for this rectangle down (top to bottom), copied exactly. Null if none. Never a dimension line.' },
              },
            },
          },
        },
      },
    },
    voids: {
      type: 'array',
      description: 'Every solid block that is not floor — a column, a shaft or duct, a chimney — standing in or against a room. Empty when there are none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['box'],
        properties: {
          box: { type: 'object', additionalProperties: false, required: ['x0', 'y0', 'x1', 'y1'], description: 'The block itself, edge to edge, on the ruler.', properties: BOX_PROPERTIES },
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
    totalAreaLabel: { type: ['string', 'null'], description: 'The area of the whole flat as the drawing prints it — a total, "საერთო ფართი", a sum under a table of rooms — copied exactly ("54.6 m²"). When several totals are printed, the one that counts every room drawn, balconies included. Null if none.' },
    notes: { type: ['string', 'null'], description: 'Anything ambiguous or unreadable worth telling the user about.' },
  },
} as const;

const SYSTEM_PROMPT = `You read architectural floor plans for a home-design tool that rebuilds them in 3D, wall for wall, so every room, wall, door and window has to come out where the drawing has it. Work through the drawing carefully before answering.

**Coordinates.** The image you get carries a blue ruler that is not part of the plan: dashed lines at every tenth of the drawing, numbered 0.0 to 1.0 along the top (x, left to right) and down the left side (y, top to bottom). Give every coordinate on that ruler, to two decimals, interpolating between the lines. When the image has no ruler, give fractions of the image's width and height.

1. **Rooms.** Report every room and space of the flat: rooms, kitchens, bathrooms, toilets, hallways and corridors, closets, storage, balconies and terraces. A space with a label is a room; an unlabelled corridor or entrance hall the doors open off is a room too (a hallway). Do not merge two rooms because the wall between them is thin, do not split a room because furniture stands in it, and do not invent a room where there is only furniture. One space labelled as two things at once ("Living Room and Kitchen", "Kitchen-Dining-Living") is one room of type studio.

2. **Room shape.** Give each room as rectangles ("parts") that together cover exactly its floor, from the inner face of one wall to the inner face of the opposite one. A rectangular room is one part. An L-shaped room is two parts — the main body, then the leg that sticks out — a T or U shape three. Parts must not overlap each other, within a room or between rooms. Where two rooms share a wall, their edges sit either side of that same wall; where a room opens onto another with no wall, their edges meet on the line where one ends and the other begins — a thin or dashed line across open floor, a change of floor pattern, or the line of a wall's end carried on. A staircase is floor: its footprint belongs to the room it starts in.

3. **Solid blocks.** A column, a shaft or duct (a small box, usually hatched, crossed or filled, in a corner or against a wall — or a corner of a bathroom or kitchen boxed off by its own thin walls), a chimney — anything solid standing in or against a room — is not floor. Report each in voids as its own rectangle, edge to edge, and do not count it as a room. Kitchen counters, cupboards, wardrobes, baths and other furniture and fixtures are not solid blocks.

4. **Sizes.** These are the only exact numbers on the drawing. Copy each one exactly as printed — "18' 3\\"" not "18.25 ft", "3,50" not "3.5", "3.5 м", "350". There are two kinds, reported in different places:
   - A **dimension line**: a size between two arrows or tick marks, with extension lines running to the walls — usually chained along the outside of the plan, often with an overall size beyond the chain. Report every one in dimensions: each segment of a chain on its own, and the overall too. axis is across when it measures left to right, down when top to bottom; from and to are where its two ends are along that axis on the ruler (x for across, y for down) — where the arrows or ticks are, which is where the extension lines meet the walls; at is where the dimension line itself is drawn on the other axis (its y for across, its x for down). Do not attach these to rooms.
   - A **size written in a room** (or in a table of rooms by name) with no dimension line — "3.50 x 4.20", "Bed 01: 3.5 x 3.0m": that room's clear inside size. Put it on the room's part, widthLabel for across and depthLabel for down, matching the two numbers to the room's shape.
   - An **area printed in a room** (or beside its name in a table) — "10.8 m²", "10,8 მ²", "116 sq ft": copy it into that room's areaLabel exactly as printed. It is the area of that room's floor, wall face to wall face, so the room's parts should cover about that much: when the rectangles you have drawn are far from the printed area, look again at where the room ends. An area of the whole flat — a total, a line in a summary table — belongs to no room: copy it into totalAreaLabel (the total that counts every room drawn, balconies included, when several are printed), and never into a room.

5. **Openings.** Every door, window, archway, open connection and balcony railing, each once:
   - door: a leaf with its swing arc. A door is in the wall its gap is in — find the gap in the wall at the pivot of the arc, not where the arc ends: side is the side of roomA that wall is on, from and to are the two ends of the gap. hinge is the point the arc pivots on (the corner of the opening the leaf hangs from); swingsInto is the room the leaf swings into, null when it swings outside.
   - window: thin parallel lines across an outer wall, or a wall onto a balcony.
   - archway: a gap in a wall between two rooms with no door in it. A gap in an outer wall that leads out of the flat is its entrance: report it as a door.
   - open: two rooms with no wall between them at all — an open-plan kitchen and living room, a hallway running straight into the living room. from and to are the ends of the stretch where nothing stands.
   - railing: a balcony's open side, drawn as a thin line or railing instead of a wall. A balcony or terrace outlined with a line much thinner than the building's walls is open on each of those sides: report a railing along each.
   For each: roomA is the room it belongs to (for one between two rooms, either), roomB the room on the other side or null for the outside, side which side of roomA's outline it is in as the image is drawn, from and to its two ends on the wall.

6. **Ignore** furniture, fixtures, plants, floor patterns, text, the ruler and dimension arrows — they are drawn on the plan but they are not walls.

Room type must be one of: ${ROOM_TYPE_VALUES.join(', ')}. Map an unusual label to the closest fit — a "study" is an office, a "WC" is a toilet, a "terrace" or "loggia" is a balcony, a "corridor" or "entry" is a hallway.

If the drawing has no sizes and no areas printed at all, still report the rooms and say so in the notes.`;

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
  const box = (b: NormBox): NormBox => ({
    x0: clamp(Math.min(b.x0, b.x1)),
    x1: clamp(Math.max(b.x0, b.x1)),
    y0: clamp(Math.min(b.y0, b.y1)),
    y1: clamp(Math.max(b.y0, b.y1)),
  });

  const rooms = (reading.rooms ?? [])
    .filter((room) => room && typeof room.name === 'string')
    .map((room, index) => ({
      name: room.name.trim() || `Room ${index + 1}`,
      type: ROOM_TYPE_VALUES.includes(room.type) ? room.type : 'living_room',
      ...(room.printedName !== undefined ? { printedName: label(room.printedName) } : {}),
      areaLabel: label(room.areaLabel),
      parts: (room.parts ?? [])
        .filter((part) => part && part.box)
        .map((part) => ({
          box: box(part.box),
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

  // A block with no size is nothing; one as big as a room is a room the model called a block.
  const voids = (reading.voids ?? [])
    .filter((v) => v && v.box)
    .map((v) => ({ box: box(v.box) }))
    .filter((v) => v.box.x1 - v.box.x0 > 0.004 && v.box.y1 - v.box.y0 > 0.004 && (v.box.x1 - v.box.x0) * (v.box.y1 - v.box.y0) < 0.03);

  return { unitSystem: reading.unitSystem === 'imperial' ? 'imperial' : 'metric', rooms, voids, openings, dimensions, ...(reading.totalAreaLabel !== undefined ? { totalAreaLabel: label(reading.totalAreaLabel) } : {}), notes: label(reading.notes) };
}

// ---------------------------------------------------------------------------
// Reading → FloorPlan
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** The drawing's ink (`planInk`), when the image is at hand: walls and gaps are read off it. */
  ink?: InkImage | null;
  imageUrl?: string | null;
  ceilingHeightM?: number;
  /** The image's width over its height when the ink is not at hand (a reading replayed alone); 1 when unknown. */
  aspect?: number;
  /** False leaves the rooms as the walls put them, not fitted to their printed areas — to see what the fit did (`plan:ai --no-fit`). */
  fitAreas?: boolean;
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
  /** Each area printed in a room against what the room measures, m² — for the `plan:ai` tool. `fitted` is false for one too far from the drawing to be held to. */
  areas: Array<{ room: string; target: number; solved: number; fitted: boolean }>;
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

/** A printed floor area in m² (`parseArea`); a bare number is read in the drawing's units. */
export function labelArea(label: string | null | undefined, unitSystem: AiPlanReading['unitSystem']): number | null {
  return label ? parseArea(label, unitSystem === 'imperial' ? 'ft2' : 'm2') : null;
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
  // The solid blocks first: each on its own edges, and wiped off the ink the rooms are pinned
  // on — a hatched shaft is ink from edge to edge, and reads as a wall wherever a room meets it.
  const context: { thinSides: ThinSide[] } = { thinSides: [] };
  const blocks: RoughRoom[] = (reading.voids ?? []).map((v, k) => ({ id: `v${k + 1}`, box: ink ? blockBox(ink, v.box) : v.box, void: true }));
  const pinInk = ink && blocks.length > 0 ? withoutInk(ink, blocks.map((b) => b.box)) : ink;
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
          ...(pinInk ? { ink: sideBands(pinInk, part.box) } : {}),
        },
      });
    });
  });
  if (ink) {
    const thinSides = thinBalconySides(reading, parts, ink);
    context.thinSides.push(...thinSides);
    dropHairlines(parts.map((p) => p.rough), ink);
    pinBlocksToWalls(blocks, parts.map((p) => p.rough));
    markOpenSides(parts);
  }

  // --- 2. the wall lines every printed dimension agrees with ---
  const dimensions = (reading.dimensions ?? []).flatMap((d): PrintedDimension[] => {
    const metres = labelMetres(d.label, reading.unitSystem);
    return metres ? [{ axis: d.axis === 'across' ? 'x' : 'y', from: d.from, to: d.to, at: d.at, metres }] : [];
  });
  const printedAreas = reading.rooms.map((room) => labelArea(room.areaLabel, reading.unitSystem));
  const aspect = options.aspect ?? (ink ? ink.width / ink.height : undefined);
  let solve = solvePlan([...parts.map((p) => p.rough), ...blocks], {
    dimensions,
    aspect,
    areaScale: scaleFromAreas(reading, parts, blocks, printedAreas, aspect ?? 1),
  });
  const doubtful = new Set(
    solve.residuals.filter((r) => Math.abs(r.solved - r.target) > 0.08).map((r) => parts.find((p) => p.rough.id === r.roomId)!.room)
  );

  // --- 3–5. the rooms as cells of the grid, the walls along their boundaries, the faces they enclose ---
  const layOut = (solved: SolveResult) => {
    const solvedById = new Map(solved.rooms.map((s) => [s.id, s.lines]));
    const grid = assignCells(
      solved.xLines,
      solved.yLines,
      reading.rooms.map((_, r) => ({
        parts: parts.filter((p) => p.room === r).map((p) => solvedById.get(p.rough.id)!),
      })),
      blocks.map((b) => solvedById.get(b.id)!)
    );

    // The walls: every boundary, open where the rooms run into each other.
    const resolver = roomResolver(reading, grid);
    const runs = boundaryRuns(grid);
    const thicknessOf = (run: Pick<BoundaryRun, 'orientation' | 'line'>) =>
      run.orientation === 'v' ? solved.xThickness[run.line] ?? DEFAULT_WALL_M : solved.yThickness[run.line] ?? DEFAULT_WALL_M;
    const openPairs = new Set<string>();
    const passagePairs = new Set<string>();
    for (const opening of reading.openings) {
      const at = solved.toPlan(midpoint(opening.from, opening.to));
      const a = resolver(opening.roomA, at);
      const b = opening.roomB ? resolver(opening.roomB, at) : -1;
      if (a < 0 || b < 0 || a === b) continue;
      if (opening.kind === 'open') openPairs.add(pairKey(a, b));
      if (opening.kind === 'door' || opening.kind === 'archway') passagePairs.add(pairKey(a, b));
    }
    const walls = splitAtJunctions(
      wallsFromRuns(runs, thicknessOf, (run) => openStretches(run, { ink, solve: solved, thicknessOf, openPairs, passagePairs }))
    );

    // The rooms those walls enclose, each given back its reading. The inside of a solid block
    // is a face of the wall graph too when the block is big, and is nobody's room.
    const faces = roomsFromWalls(walls, { defaultThicknessM: DEFAULT_WALL_M, defaultHeightM: heightM }).filter(
      (face) => ownerAt(grid, polygonCentroid(face.polygon)) !== SOLID
    );
    const byIndex = new Map<number, PlanRoom>();
    const used = new Set<PlanRoom>();
    reading.rooms.forEach((room, r) => {
      const anchor = roomAnchor(grid, r);
      const face = anchor ? faces.find((f) => !used.has(f) && pointInPolygon(anchor, f.polygon)) : undefined;
      if (!face) return;
      used.add(face);
      face.id = `r${r + 1}`;
      // The drawing's own label; a room it prints none for is called what it is.
      face.name = room.printedName === undefined ? room.name : room.printedName ?? nextRoomName([], room.type);
      face.type = room.type;
      face.heightM = heightM;
      byIndex.set(r, face);
    });
    // A face no reading room claims is a pocket the walls closed by themselves; it keeps the type
    // its size suggests rather than vanishing, since the walls around it are real.
    let extra = reading.rooms.length;
    const rooms = faces.map((face) => {
      if (!used.has(face)) face.id = `r${++extra}`;
      return face;
    });
    return { grid, resolver, runs, walls, rooms, byIndex };
  };
  let laid = layOut(solve);

  // --- 5b. every room the size printed in it ---
  // The rooms are measured as the board will measure them (the faces above); the lines move a
  // little, the plan is laid out again, and so on until each room is its printed area.
  const measured = (from: ReturnType<typeof layOut>, r: number) => {
    const room = from.byIndex.get(r);
    return room ? polygonAreaM2(room.polygon) : null;
  };
  // Held to its label only when the drawing agrees it is about that size: a label far off is
  // a misread, or the area of something else.
  const fitted = new Set<number>();
  printedAreas.forEach((target, r) => {
    const now = measured(laid, r);
    if (solve.scaleKnown && target != null && now != null && Math.abs(now - target) <= MAX_AREA_DRIFT * target) fitted.add(r);
    else if (solve.scaleKnown && target != null && now != null) doubtful.add(r);
  });
  const worstArea = (from: ReturnType<typeof layOut>) =>
    [...fitted].reduce((max, r) => Math.max(max, Math.abs((measured(from, r) ?? printedAreas[r]!) - printedAreas[r]!)), 0);
  if (fitted.size > 0 && options.fitAreas !== false) {
    let best = { solve, laid, error: worstArea(laid) };
    const base = { x: solve.xLines, y: solve.yLines };
    // Neighbouring lines the fit has brought as close as they may come: held from then on.
    const held: SolveResult['ties'] = [];
    for (let pass = 0; pass < 16 && best.error > AREA_TOLERANCE_M2; pass++) {
      const targets = [...fitted].flatMap((r) => {
        const current = measured(laid, r);
        return current == null ? [] : [{ room: r, target: printedAreas[r]!, current }];
      });
      const stiffness = lineStiffness(solve, laid.walls);
      const stepWith = () => areaStep({ nx: solve.xLines.length, ny: solve.yLines.length, runs: laid.runs, targets, stiffness, ties: [...solve.ties, ...held] });
      let step = stepWith();
      for (let again = 0; step && again < 6; again++) {
        const squeezed = [...squeezedPairs(solve.xLines, step.dx, base.x, 'x'), ...squeezedPairs(solve.yLines, step.dy, base.y, 'y')];
        if (squeezed.length === 0) break;
        held.push(...squeezed);
        step = stepWith();
      }
      if (!step || squeezedPairs(solve.xLines, step.dx, base.x, 'x').length + squeezedPairs(solve.yLines, step.dy, base.y, 'y').length > 0) break;
      const xs = solve.xLines.map((v, i) => v + step!.dx[i]);
      const ys = solve.yLines.map((v, i) => v + step!.dy[i]);
      // Areas that only walls moved far from where they are drawn could meet are not the
      // drawing's: the fit stops there, and the rooms still off are flagged for a look.
      if (farthestShift(xs, base.x) > MAX_FIT_SHIFT_M || farthestShift(ys, base.y) > MAX_FIT_SHIFT_M) break;
      solve = withLines(solve, xs, ys);
      laid = layOut(solve);
      // A step that lost a room (two lines met) is not kept.
      if ([...fitted].some((r) => measured(laid, r) == null)) break;
      const error = worstArea(laid);
      if (error < best.error) best = { solve, laid, error };
    }
    solve = best.solve;
    laid = best.laid;
  }
  const { walls, rooms, byIndex, resolver } = laid;
  for (const r of fitted) {
    const now = measured(laid, r);
    if (now == null || Math.abs(now - printedAreas[r]!) > 0.05) doubtful.add(r);
  }
  for (const r of doubtful) {
    const room = byIndex.get(r);
    if (room) room.lowConfidence = true;
  }
  const areas = printedAreas.flatMap((target, r) => {
    const solved = measured(laid, r);
    return target != null && solved != null ? [{ room: reading.rooms[r].name, target, solved: round2(solved), fitted: fitted.has(r) }] : [];
  });

  // --- 6. doors, windows and railings where the drawing has them; inference only for the rest ---
  const wallById = new Map(walls.map((w) => [w.id, w]));
  placeReadOpenings(rooms, reading, { byIndex, resolver, solve, ink, wallById, thinSides: context.thinSides });
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

  return { plan, worstResidualM, lowConfidence: solve.lowConfidence, scaleKnown: solve.scaleKnown, notes: reading.notes, areas, solve };
}

/** Rooms are fitted until each is within this of its printed area, m² — under what two decimals show. */
const AREA_TOLERANCE_M2 = 0.002;

/** The furthest the fit may move a line from where the walls put it, relative to the plan's first line, metres. */
const MAX_FIT_SHIFT_M = 0.4;

/** How far the line that moved most has gone from `base`, the first line taken as standing still. */
function farthestShift(lines: number[], base: number[]): number {
  return lines.reduce((max, v, i) => Math.max(max, Math.abs(v - lines[0] - (base[i] - base[0]))), 0);
}

/**
 * Metres per normalised unit from the areas printed in the rooms — for a drawing with no length
 * on it, where they are the only numbers there are. Each room's rectangles are measured face to
 * face on the image (a pinned side at its wall band's inner face, the rest where the model put
 * them, less the solid blocks standing in them); the printed area over that is metres² per unit²,
 * the median over the rooms is the plan's, and the image's shape splits it between the axes.
 * With no area in any room, the flat's printed total over all the rooms drawn does the same,
 * more roughly (it may or may not count the balconies). Null when no area is printed at all.
 */
function scaleFromAreas(
  reading: AiPlanReading,
  parts: Array<{ room: number; rough: RoughRoom }>,
  blocks: RoughRoom[],
  printedAreas: Array<number | null>,
  aspect: number
): { x: number; y: number } | null {
  const face = (rough: RoughRoom, side: 'x0' | 'x1' | 'y0' | 'y1'): number => {
    const band = rough.ink?.[side];
    if (!band) return rough.box[side];
    return side === 'x0' || side === 'y0' ? band.centre + band.thickness / 2 : band.centre - band.thickness / 2;
  };
  const overlap = (a: NormBox, b: NormBox) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const ratios: number[] = [];
  let drawn = 0;
  reading.rooms.forEach((_, r) => {
    const target = printedAreas[r];
    let floor = 0;
    for (const { room, rough } of parts) {
      if (room !== r) continue;
      const box = { x0: face(rough, 'x0'), x1: face(rough, 'x1'), y0: face(rough, 'y0'), y1: face(rough, 'y1') };
      floor += Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0) - blocks.reduce((sum, b) => sum + overlap(box, b.box), 0);
    }
    drawn += Math.max(0, floor);
    if (target != null && floor > 1e-5) ratios.push(target / floor);
  });
  // No room carries an area: the flat's printed total over every room drawn.
  const total = labelArea(reading.totalAreaLabel, reading.unitSystem);
  if (ratios.length === 0 && total != null && drawn > 1e-5) ratios.push(total / drawn);
  if (ratios.length === 0) return null;
  const perUnit2 = ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
  const y = Math.sqrt(perUnit2 / aspect);
  return { x: y * aspect, y };
}

/**
 * How hard each grid line holds its place when the rooms are fitted to their areas: a wall the
 * image showed stays nearly where it is, a wall it did not show gives a little, and a line with
 * only room separators on it — a boundary the drawing does not build — moves freely.
 */
function lineStiffness(solve: SolveResult, walls: Wall[]): { x: number[]; y: number[] } {
  const tally = (lines: number[], vertical: boolean) => {
    const wall = new Array<number>(lines.length).fill(0);
    const open = new Array<number>(lines.length).fill(0);
    for (const w of walls) {
      const isVertical = Math.abs(w.a.x - w.b.x) < 1e-6;
      if (isVertical !== vertical) continue;
      const at = vertical ? w.a.x : w.a.z;
      const index = lines.findIndex((v) => Math.abs(v - at) < 2e-3);
      if (index < 0) continue;
      const length = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      if (w.separator) open[index] += length;
      else wall[index] += length;
    }
    return { wall, open };
  };
  const stiffness = (lines: number[], vertical: boolean, shown: boolean[]) => {
    const { wall, open } = tally(lines, vertical);
    return lines.map((_, i) => (open[i] > 0 && wall[i] < 0.3 ? 0.03 : shown[i] ? 1 : 0.3));
  };
  return { x: stiffness(solve.xLines, true, solve.xMeasured), y: stiffness(solve.yLines, false, solve.yMeasured) };
}

/** A band's thickness in pixels: it is normalised to the width on a vertical side, the height on a horizontal one. */
function bandPixels(ink: InkImage): (side: 'x0' | 'x1' | 'y0' | 'y1', thickness: number) => number {
  return (side, thickness) => thickness * (side === 'x0' || side === 'x1' ? ink.width : ink.height);
}

/**
 * Where two rooms meet on one line and the image shows no wall on either's side of it, the
 * rooms run into each other there — an open-plan kitchen and its hallway. Both sides are marked
 * with the line they share (`RoughRoom.openSides`), so the solver keeps it a line of its own
 * instead of drawing it onto the nearest wall: a kitchen that ends 20 cm short of the partition
 * beside it is not a kitchen that reaches it.
 */
function markOpenSides(parts: Array<{ room: number; rough: RoughRoom }>): void {
  const MEET = 0.008;
  const mark = (rough: RoughRoom, side: 'x0' | 'x1' | 'y0' | 'y1', at: number) => {
    rough.openSides = { ...rough.openSides, [side]: at };
  };
  for (const p of parts) {
    for (const q of parts) {
      if (p.room === q.room) continue;
      const a = p.rough;
      const b = q.rough;
      // a's right side on b's left, along a shared stretch.
      const overlapY = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
      if (!a.ink?.x1 && !b.ink?.x0 && Math.abs(a.box.x1 - b.box.x0) <= MEET && overlapY >= 0.3 * Math.min(a.box.y1 - a.box.y0, b.box.y1 - b.box.y0)) {
        const at = (a.box.x1 + b.box.x0) / 2;
        mark(a, 'x1', at);
        mark(b, 'x0', at);
      }
      // a's bottom side on b's top.
      const overlapX = Math.min(a.box.x1, b.box.x1) - Math.max(a.box.x0, b.box.x0);
      if (!a.ink?.y1 && !b.ink?.y0 && Math.abs(a.box.y1 - b.box.y0) <= MEET && overlapX >= 0.3 * Math.min(a.box.x1 - a.box.x0, b.box.x1 - b.box.x0)) {
        const at = (a.box.y1 + b.box.y0) / 2;
        mark(a, 'y1', at);
        mark(b, 'y0', at);
      }
    }
  }
}

/**
 * A solid block standing against a wall is on that wall's line. A side of a block that lies in
 * or just off a wall band one of the rooms was pinned on, along the same stretch, takes the
 * band — or the block would get a line of its own a hand from the wall, and a sliver of floor
 * between the two.
 */
function pinBlocksToWalls(blocks: RoughRoom[], rooms: RoughRoom[]): void {
  const REACH = 0.015;
  for (const block of blocks) {
    for (const side of ['x0', 'x1', 'y0', 'y1'] as const) {
      const vertical = side === 'x0' || side === 'x1';
      const [lo, hi] = vertical ? [block.box.y0, block.box.y1] : [block.box.x0, block.box.x1];
      let best: InkEdge | null = null;
      for (const room of rooms) {
        const [from, to] = vertical ? [room.box.y0, room.box.y1] : [room.box.x0, room.box.x1];
        if (Math.min(hi, to) - Math.max(lo, from) < (hi - lo) * 0.5) continue;
        for (const other of vertical ? (['x0', 'x1'] as const) : (['y0', 'y1'] as const)) {
          const band = room.ink?.[other];
          if (!band) continue;
          const off = Math.abs(block.box[side] - band.centre);
          if (off <= band.thickness / 2 + REACH && (!best || off < Math.abs(block.box[side] - best.centre))) best = band;
        }
      }
      if (best) block.ink = { ...block.ink, [side]: best };
    }
  }
}

/** The wall bands the ink shows along a rectangle's four sides. */
function sideBands(ink: InkImage, box: NormBox): RoughRoom['ink'] {
  const reachX = (box.x1 - box.x0) * 0.4;
  const reachY = (box.y1 - box.y0) * 0.4;
  const band = (orientation: 'h' | 'v', at: number, from: number, to: number, reach: number): InkEdge | null => {
    const found = wallBandNear(ink, { orientation, at, from, to, reach });
    return found ? { centre: found.centre, thickness: found.thickness, coverage: found.coverage } : null;
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
 * stays and it takes the typical thickness. A band that thick whose *inner* face is where the
 * room was read to end is the other thing — a mass of masonry behind the room's wall, a pier or
 * the solid corner another room steps round — and there the inner face stays.
 */
function dropHairlines(rough: RoughRoom[], ink: InkImage): void {
  const sides = ['x0', 'x1', 'y0', 'y1'] as const;
  // In pixels: a band's thickness is a share of the image's width on a vertical side and of its
  // height on a horizontal one, and the two only compare on a square image.
  const px = bandPixels(ink);
  const thicknesses = rough.flatMap((r) => sides.flatMap((side) => (r.ink?.[side] ? [px(side, r.ink[side]!.thickness)] : [])));
  if (thicknesses.length < 3) return;
  const typicalPx = [...thicknesses].sort((a, b) => a - b)[Math.floor(thicknesses.length / 2)];
  for (const r of rough) {
    for (const side of sides) {
      const band = r.ink?.[side];
      if (!band) continue;
      // The typical wall as a share of this side's own axis.
      const typical = typicalPx / px(side, 1);
      if (band.thickness < typical * 0.5) r.ink![side] = null;
      else if (band.thickness > typical * 2.6) {
        // The room lies on the + side of an x0/y0 band and the − side of an x1/y1 one.
        const outward = side === 'x0' || side === 'y0' ? -1 : 1;
        const outer = band.centre + (outward * band.thickness) / 2;
        const inner = band.centre - (outward * band.thickness) / 2;
        // Where the room was read to end says which: at the mass's near face, or a wall's thickness in from its far one.
        const solidBehind = Math.abs(r.box[side] - inner) < Math.abs(r.box[side] - (outer - outward * typical));
        r.ink![side] = solidBehind ? { centre: inner + (outward * typical) / 2, thickness: typical } : { centre: outer - (outward * typical) / 2, thickness: typical };
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
  /** The balcony sides the drawing draws as a thin line (`thinBalconySides`). */
  thinSides: ThinSide[];
}

/** One side of a balcony's rectangle drawn as a line too thin to be a wall. */
interface ThinSide {
  room: number;
  side: PlanSide;
  /** The middle of that side, on the image. */
  mid: AiPoint;
}

/**
 * The sides of the balconies' rectangles that the drawing draws as a thin line — under 70 % of
 * its typical wall — rather than as a wall: a parapet rail, a glass screen. Read before the
 * hairlines are dropped (`dropHairlines`), which forgets them.
 */
function thinBalconySides(reading: AiPlanReading, parts: Array<{ room: number; rough: RoughRoom }>, ink: InkImage): ThinSide[] {
  const sides = ['x0', 'x1', 'y0', 'y1'] as const;
  const px = bandPixels(ink);
  const thicknesses = parts.flatMap((p) => sides.flatMap((side) => (p.rough.ink?.[side] ? [px(side, p.rough.ink[side]!.thickness)] : [])));
  if (thicknesses.length < 3) return [];
  // The typical wall among the bands that are walls at all: a drawing's hairlines are not.
  const sorted = [...thicknesses].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length * 0.65)];
  const name: Record<(typeof sides)[number], PlanSide> = { x0: 'left', x1: 'right', y0: 'top', y1: 'bottom' };
  const out: ThinSide[] = [];
  for (const { room, rough } of parts) {
    if (reading.rooms[room].type !== 'balcony') continue;
    for (const side of sides) {
      const band = rough.ink?.[side];
      if (!band || px(side, band.thickness) >= typical * 0.7 || (band.coverage ?? 0) < 0.8) continue;
      const box = rough.box;
      const mid = side === 'x0' || side === 'x1' ? { x: box[side], y: (box.y0 + box.y1) / 2 } : { x: (box.x0 + box.x1) / 2, y: box[side] };
      out.push({ room, side: name[side], mid });
    }
  }
  return out;
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
  const { byIndex, resolver, solve, ink, wallById, thinSides } = context;
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
      const gap = nearestGap(ink, solve, edge, thicknessBehind(room, edge), kind, centre, usedGaps);
      if (gap) {
        centre = (gap.from + gap.to) / 2;
        width = openingWidth(kind, gap.to - gap.from, labelMetres(read.widthLabel, reading.unitSystem), edge.length);
      }
    }

    const margin = cornerMargin(kind);
    let t = projectToEdge(edge, pointOnEdge(edge, clamp01(centre / edge.length)), width, margin);
    if (overlapsOpening(room, edge.index, t, width, edge.length)) {
      // A window between a corner and a door, a door beside another: it takes the wall that is
      // left there rather than going missing.
      const squeezed = squeezeOnEdge(room, edge, centre, width, kind);
      if (!squeezed) continue;
      width = squeezed.width;
      t = squeezed.centre / edge.length;
    }

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

  // --- the doorways the drawing shows and the reading left out ---
  // A gap in a solid wall between two rooms is a way through whether or not it was reported:
  // a door read onto the wrong wall leaves the right one a blank wall, and its room shut in.
  if (ink) {
    for (const room of rooms) {
      for (const edge of wallEdges(room)) {
        const thickness = thicknessBehind(room, edge);
        const middle = pointOnEdge(edge, 0.5);
        const other = rooms.find((r) => r !== room && r.id > room.id && facingEdge(r, edge, middle, thickness)) ?? null;
        if (!other) continue;
        for (const gap of edgeGaps(ink, solve, edge, thickness)) {
          const width = gap.to - gap.from;
          if (gap.kind !== 'empty' || width < 0.55 || width > 1.3 || usedGaps.has(gap.key)) continue;
          const centre = pointOnEdge(edge, clamp01((gap.from + gap.to) / 2 / edge.length));
          const twinEdge = facingEdge(other, edge, centre, thickness);
          if (!twinEdge) continue;
          const t = projectToEdge(edge, centre, width, cornerMargin('door'));
          const twinT = projectToEdge(twinEdge, centre, width, cornerMargin('door'));
          if (overlapsOpening(room, edge.index, t, width, edge.length) || overlapsOpening(other, twinEdge.index, twinT, width, twinEdge.length)) continue;
          usedGaps.add(gap.key);
          const primary: Opening = {
            id: `${room.id}-o${++serial}`,
            kind: 'door',
            wallIndex: edge.index,
            t,
            widthM: round2(width),
            heightM: OPENING_DEFAULTS.door.heightM,
            sillM: 0,
            roomId: room.id,
            connectsToRoomId: other.id,
            exterior: false,
            hinge: 'left',
            swing: 'in',
            origin: 'existing',
          };
          room.openings.push(primary);
          other.openings.push({ ...primary, id: `${other.id}-${room.id}-d-${primary.id}`, wallIndex: twinEdge.index, t: twinT, roomId: other.id, connectsToRoomId: room.id, hinge: mirrorHinge('left'), swing: mirrorSwing('in') });
        }
      }
    }
  }

  // --- a balcony drawn with a thin line where a wall would be has a railing there ---
  // On every such side nothing was put on: a reading that names one railing of three leaves the
  // other two sides walls to the ceiling.
  for (const [index, room] of byIndex) {
    if (!holdsRailings(room)) continue;
    for (const thin of thinSides) {
      if (thin.room !== index) continue;
      const choice = chooseEdge(room, null, thin.side, solve.toPlan(thin.mid), rooms, thicknessBehind);
      if (!choice || choice.behind || INWARD[thin.side].x * choice.edge.inward.x + INWARD[thin.side].z * choice.edge.inward.z < 0.9) continue;
      if (room.openings.some((o) => o.wallIndex === choice.edge.index)) continue;
      room.openings.push({
        id: `${room.id}-o${++serial}`,
        kind: 'railing',
        wallIndex: choice.edge.index,
        t: 0.5,
        widthM: round2(choice.edge.length),
        heightM: OPENING_DEFAULTS.railing.heightM,
        sillM: 0,
        roomId: room.id,
        connectsToRoomId: null,
        exterior: true,
        origin: 'existing',
      });
    }
  }
}

/**
 * The stretch of a wall an opening can still have, when where it was read is partly taken — by
 * the corner's margin or by an opening already there: the free stretch nearest it, as much of
 * the opening as fits. Null when what is left is too narrow to be one.
 */
function squeezeOnEdge(room: PlanRoom, edge: PlanEdge, centre: number, width: number, kind: OpeningKind): { centre: number; width: number } | null {
  if (kind === 'railing') return null;
  const margin = cornerMargin(kind);
  const taken = room.openings
    .filter((o) => o.wallIndex === edge.index)
    .map((o): [number, number] => [o.t * edge.length - o.widthM / 2 - 0.02, o.t * edge.length + o.widthM / 2 + 0.02])
    .sort((p, q) => p[0] - q[0]);
  const free: Array<[number, number]> = [];
  let cursor = margin;
  for (const [from, to] of taken) {
    if (from > cursor) free.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (edge.length - margin > cursor) free.push([cursor, edge.length - margin]);
  const smallest = kind === 'window' ? 0.3 : 0.6;
  let best: { centre: number; width: number; off: number } | null = null;
  for (const [from, to] of free) {
    const lo = Math.max(from, centre - width / 2);
    const hi = Math.min(to, centre + width / 2);
    // Where it was read, clipped — or, read wholly outside this stretch, as much of it as fits at the near end.
    const span: [number, number] = hi - lo >= smallest ? [lo, hi] : centre < from ? [from, Math.min(to, from + width)] : [Math.max(from, to - width), to];
    if (span[1] - span[0] < smallest) continue;
    const off = Math.abs((span[0] + span[1]) / 2 - centre);
    if (!best || off < best.off) best = { centre: (span[0] + span[1]) / 2, width: span[1] - span[0], off };
  }
  return best && best.off <= 1 ? { centre: best.centre, width: best.width } : null;
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

/** A gap in the wall behind an edge, metres along the edge. */
interface EdgeGap {
  from: number;
  to: number;
  kind: 'empty' | 'glazed';
  /** Where it is in the plan, to the decimetre — one gap is one opening, whichever room asks. */
  key: string;
}

/**
 * The gaps the drawing leaves in the wall behind `edge` — its doorways and windows — or none
 * when the drawing does not draw this wall solid. Each gap is placed through the solve's
 * mapping and is as wide as the image shows at the plan's own scale: the mapping stretches a
 * little between lines the printed sizes and areas moved, and a door is not wider for that.
 */
function edgeGaps(ink: InkImage, solve: SolveResult, edge: PlanEdge, thickness: number): EdgeGap[] {
  // The wall's centreline, half its thickness behind the room's face.
  const out = { x: -edge.inward.x * (thickness / 2), z: -edge.inward.z * (thickness / 2) };
  const a = solve.toImage({ x: edge.a.x + out.x, z: edge.a.z + out.z });
  const b = solve.toImage({ x: edge.b.x + out.x, z: edge.b.z + out.z });
  const horizontal = edge.axis === 'x';
  const stretch: LineStretch = horizontal
    ? { orientation: 'h', at: (a.y + b.y) / 2, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) }
    : { orientation: 'v', at: (a.x + b.x) / 2, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) };
  const across = horizontal ? solve.initialScale.y : solve.initialScale.x;
  const along = horizontal ? solve.initialScale.x : solve.initialScale.y;
  const gaps = gapsAlong(ink, stretch, thickness / across, Math.min(1, 0.4 / Math.max(edge.length, 0.01)));
  if (!gaps) return [];

  const found: EdgeGap[] = [];
  for (const gap of gaps) {
    // Back from the image onto the edge.
    const at = (f: number) => stretch.from + f * (stretch.to - stretch.from);
    const p = (f: number) => solve.toPlan(horizontal ? { x: at(f), y: stretch.at } : { x: stretch.at, y: at(f) });
    const centre = alongEdge(edge, p((gap.from + gap.to) / 2));
    const width = (at(gap.to) - at(gap.from)) * along;
    const from = Math.max(0, centre - width / 2);
    const to = Math.min(edge.length, centre + width / 2);
    if (to - from < 0.3) continue;
    const world = pointOnEdge(edge, clamp01((from + to) / 2 / edge.length));
    found.push({ from, to, kind: gap.kind, key: `${Math.round(world.x * 10)}:${Math.round(world.z * 10)}` });
  }
  return found;
}

/**
 * The gap in the wall behind `edge` nearest to where an opening was read, metres along the edge
 * — or null when the drawing does not draw this wall solid, or no free gap is near. A window
 * takes a glazed gap before an empty one, a door or archway the other way round.
 */
function nearestGap(
  ink: InkImage,
  solve: SolveResult,
  edge: PlanEdge,
  thickness: number,
  kind: OpeningKind,
  centre: number,
  used: Set<string>
): { from: number; to: number } | null {
  let best: { from: number; to: number; cost: number; key: string } | null = null;
  for (const gap of edgeGaps(ink, solve, edge, thickness)) {
    if (used.has(gap.key)) continue;
    const mismatch = (kind === 'window') !== (gap.kind === 'glazed');
    const cost = Math.abs((gap.from + gap.to) / 2 - centre) + (mismatch ? 0.8 : 0);
    if (cost <= 1.8 && (!best || cost < best.cost)) best = { from: gap.from, to: gap.to, cost, key: gap.key };
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
