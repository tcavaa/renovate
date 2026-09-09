/**
 * Reading a floor plan with Claude.
 *
 * The division of labour matters here. The model is asked for the things it is genuinely good
 * at — what the rooms are called, which type each is, roughly where each sits, what the
 * dimension labels *say*, and what connects to what. It is deliberately **not** asked for
 * precise coordinates, because a vision model returns those a few percent out and nothing
 * downstream can tell. `planSolver` turns the rough boxes plus the exact labels into geometry
 * whose walls match the drawing.
 *
 * This module is pure apart from the one API call: the prompt, the schema and the conversion
 * are all testable without a key, and `parseFloorPlanWithAI` is the only function that talks
 * to the network.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RoomType } from '@/lib/calculator/types';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { detectUnitSystem, parseLength } from './measure';
import { solvePlan, type RoughRoom } from './planSolver';
import { deriveOpenings, polygonAreaM2, polygonPerimeterM, roomEdges, toCounterClockwise } from './planGeometry';
import type { FloorPlan, Opening, PlanRoom, Vec2 } from './types';

export const PLAN_MODEL = 'claude-opus-5';

const ROOM_TYPE_VALUES = Object.keys(ROOM_TYPES) as RoomType[];

// ---------------------------------------------------------------------------
// What we ask the model for
// ---------------------------------------------------------------------------

export interface AiRoom {
  name: string;
  type: RoomType;
  /** Normalised bounding box of the room's interior, 0..1, y down. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** The dimension exactly as printed on the drawing, e.g. `18' 3"`. Null when unlabelled. */
  widthLabel: string | null;
  depthLabel: string | null;
}

export interface AiOpening {
  kind: 'door' | 'window' | 'archway';
  /** Room names, matching `AiRoom.name`. `null` for the outside. */
  roomA: string;
  roomB: string | null;
  /** Normalised position of the opening's centre. */
  at: { x: number; y: number };
  widthLabel: string | null;
}

export interface AiPlanReading {
  unitSystem: 'imperial' | 'metric';
  rooms: AiRoom[];
  openings: AiOpening[];
  /** The model's own note about anything ambiguous. Surfaced to the user, not acted on. */
  notes: string | null;
}

/**
 * The tool the model fills in.
 *
 * `strict: true` with `additionalProperties: false` is what guarantees the arguments validate
 * against this schema, so the conversion below never has to defend against a missing field —
 * only against a *wrong* one, which is a different problem.
 */
const SUBMIT_PLAN_TOOL: Anthropic.Tool = {
  name: 'submit_plan',
  description: 'Report the rooms, printed dimensions and openings read from the floor plan.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['unitSystem', 'rooms', 'openings', 'notes'],
    properties: {
      unitSystem: {
        type: 'string',
        enum: ['imperial', 'metric'],
        description: 'Which units the drawing is annotated in.',
      },
      rooms: {
        type: 'array',
        description: 'Every enclosed space, including balconies, hallways and closets.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'type', 'box', 'widthLabel', 'depthLabel'],
          properties: {
            name: { type: 'string', description: 'The label printed on the plan, verbatim.' },
            type: { type: 'string', enum: ROOM_TYPE_VALUES },
            box: {
              type: 'object',
              additionalProperties: false,
              required: ['x0', 'y0', 'x1', 'y1'],
              description:
                'Bounding box of the room INTERIOR in normalised image coordinates: x0/x1 as a fraction of image width, y0/y1 as a fraction of image height, origin top-left. Approximate is fine.',
              properties: {
                x0: { type: 'number' },
                y0: { type: 'number' },
                x1: { type: 'number' },
                y1: { type: 'number' },
              },
            },
            widthLabel: {
              type: ['string', 'null'],
              description:
                'The horizontal dimension printed for this room, copied EXACTLY as it appears, e.g. "18\' 3\\"" or "3,5 м". Null if none is printed.',
            },
            depthLabel: {
              type: ['string', 'null'],
              description: 'The vertical dimension printed for this room, copied exactly. Null if none.',
            },
          },
        },
      },
      openings: {
        type: 'array',
        description: 'Doors, archways and windows visible on the plan.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'roomA', 'roomB', 'at', 'widthLabel'],
          properties: {
            kind: { type: 'string', enum: ['door', 'window', 'archway'] },
            roomA: { type: 'string', description: 'Room name this opening belongs to.' },
            roomB: {
              type: ['string', 'null'],
              description: 'The room on the other side, or null when it leads outside.',
            },
            at: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: { x: { type: 'number' }, y: { type: 'number' } },
            },
            widthLabel: { type: ['string', 'null'] },
          },
        },
      },
      notes: {
        type: ['string', 'null'],
        description: 'Anything ambiguous or unreadable worth telling the user about.',
      },
    },
  },
};

const SYSTEM_PROMPT = `You read architectural floor plans and report what is drawn on them.

You are reading the plan for a home-design tool that will rebuild it in 3D, so the geometry has to be right. Work through the drawing carefully before answering.

What matters most:

1. **Find every enclosed space.** Bedrooms, bathrooms, kitchens, hallways, balconies, closets. A space with a label is a room. Do not merge two rooms because a wall between them is thin, and do not invent a room where there is only furniture.

2. **Copy the dimension labels exactly as printed.** These are the only exact numbers on the drawing. Copy the characters you see — "18' 3\\"" not "18.25 ft", "3,5 м" not "3.5 m". Assign each label to the room whose wall it measures. If a label spans several rooms, leave those rooms' labels null rather than guessing a split.

3. **Boxes are approximate and that is fine.** Give each room's interior bounding box as fractions of the image. Being a few percent out does not matter — the exact dimensions come from the labels. What does matter is that rooms do not overlap and that adjacent rooms have edges near each other.

4. **Ignore the furniture.** Sofas, beds, kitchen counters, plants and dimension arrows are drawn on the plan but are not walls.

Room type must be one of: ${ROOM_TYPE_VALUES.join(', ')}. Map an unusual label to the closest fit — a "study" is an office, a "WC" is a toilet, a "terrace" is a balcony.

If the drawing has no dimension labels at all, still report the rooms and their boxes, and say so in the notes.`;

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface AiPlanRequest {
  imageBase64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
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

  const response = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 16000,
    // Reading a plan is a reasoning task, not a captioning one — which room a dimension
    // belongs to often takes working out.
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'submit_plan' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: request.mediaType, data: request.imageBase64 },
          },
          {
            type: 'text',
            text: 'Read this floor plan and submit what you find.',
          },
        ],
      },
    ],
  });

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
  if (!call) {
    throw new Error(`Model returned no plan (stop_reason: ${response.stop_reason})`);
  }

  return {
    reading: normaliseReading(call.input as unknown as AiPlanReading),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - started,
      model: response.model,
    },
  };
}

/**
 * Tidies a reading before geometry sees it. The strict schema guarantees the shape; this
 * guards the values — a box slightly outside the image, a box the model gave inverted, a
 * blank label — so the solver never has to.
 */
export function normaliseReading(reading: AiPlanReading): AiPlanReading {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const label = (v: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const rooms = (reading.rooms ?? [])
    .filter((room) => room && typeof room.name === 'string')
    .map((room, index) => {
      const x0 = clamp(Math.min(room.box.x0, room.box.x1));
      const x1 = clamp(Math.max(room.box.x0, room.box.x1));
      const y0 = clamp(Math.min(room.box.y0, room.box.y1));
      const y1 = clamp(Math.max(room.box.y0, room.box.y1));
      return {
        ...room,
        name: room.name.trim() || `Room ${index + 1}`,
        type: ROOM_TYPE_VALUES.includes(room.type) ? room.type : 'living_room',
        box: { x0, y0, x1, y1 },
        widthLabel: label(room.widthLabel),
        depthLabel: label(room.depthLabel),
      };
    })
    // A box with no area is not a room the geometry can use.
    .filter((room) => room.box.x1 - room.box.x0 > 0.005 && room.box.y1 - room.box.y0 > 0.005);
  const openings = (reading.openings ?? [])
    .filter((o) => o && typeof o.roomA === 'string')
    .map((o) => ({ ...o, at: { x: clamp(o.at.x), y: clamp(o.at.y) }, widthLabel: label(o.widthLabel) }));
  return { unitSystem: reading.unitSystem === 'imperial' ? 'imperial' : 'metric', rooms, openings, notes: label(reading.notes) };
}

// ---------------------------------------------------------------------------
// Reading → FloorPlan
// ---------------------------------------------------------------------------

export interface BuildOptions {
  imageUrl?: string | null;
  wallThicknessM?: number;
  ceilingHeightM?: number;
}

export interface AiPlanResult {
  plan: FloorPlan;
  /** Largest gap between a printed dimension and the solved wall, in metres. */
  worstResidualM: number;
  /** True when the drawing's own dimensions disagree enough to warrant a look. */
  lowConfidence: boolean;
  notes: string | null;
}

/**
 * Converts a model reading into an exact `FloorPlan`.
 *
 * Pure — no network — so the whole conversion can be tested against a recorded reading.
 */
export function buildPlanFromReading(
  reading: AiPlanReading,
  options: BuildOptions = {}
): AiPlanResult {
  const wallThicknessM = options.wallThicknessM ?? 0.12;

  const fallbackUnit = reading.unitSystem === 'imperial' ? 'ft' : 'm';
  const rough: RoughRoom[] = reading.rooms.map((room, index) => ({
    id: `r${index + 1}`,
    box: room.box,
    widthM: parseLength(room.widthLabel ?? '', fallbackUnit)?.metres ?? null,
    depthM: parseLength(room.depthLabel ?? '', fallbackUnit)?.metres ?? null,
  }));

  const solved = solvePlan(rough);
  const solvedById = new Map(solved.rooms.map((room) => [room.id, room.box]));
  // Rooms whose printed dimension the solver could not honour get flagged, so the review
  // step points at them instead of asking the user to check everything.
  const doubtful = new Set(solved.residuals.filter((r) => Math.abs(r.solved - r.target) > 0.08).map((r) => r.roomId));

  const rooms: PlanRoom[] = reading.rooms.map((room, index) => {
    const id = `r${index + 1}`;
    const box = solvedById.get(id) ?? { x0: 0, y0: 0, x1: 3, y1: 3 };

    // The plan lies in XZ with Y up, so the image's y becomes z.
    const polygon = toCounterClockwise([
      { x: box.x0, z: box.y0 },
      { x: box.x1, z: box.y0 },
      { x: box.x1, z: box.y1 },
      { x: box.x0, z: box.y1 },
    ]);

    return {
      id,
      type: room.type,
      name: room.name,
      polygon,
      heightM: options.ceilingHeightM ?? ROOM_TYPES[room.type].defaultHeight,
      areaM2: round2(polygonAreaM2(polygon)),
      perimeterM: round2(polygonPerimeterM(polygon)),
      openings: [],
      ...(doubtful.has(id) ? { lowConfidence: true } : {}),
    };
  });

  // Start from the geometric inference — it guarantees every room is reachable and every
  // exterior wall gets a window — then let the drawing override what it actually shows.
  deriveOpenings(rooms, wallThicknessM);
  applyReadOpenings(rooms, reading, solved.initialScale, fallbackUnit);

  const allX = rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const allZ = rooms.flatMap((r) => r.polygon.map((p) => p.z));

  const worstResidualM = solved.residuals.reduce(
    (max, r) => Math.max(max, Math.abs(r.solved - r.target)),
    0
  );

  return {
    plan: {
      rooms,
      metresPerPixel: null,
      bounds: {
        width: allX.length ? Math.max(...allX) - Math.min(...allX) : 0,
        depth: allZ.length ? Math.max(...allZ) - Math.min(...allZ) : 0,
      },
      source: 'parsed',
      imageUrl: options.imageUrl ?? null,
      wallThicknessM,
    },
    worstResidualM,
    lowConfidence: solved.lowConfidence,
    notes: reading.notes,
  };
}

/**
 * Replaces inferred openings with the ones actually drawn.
 *
 * `deriveOpenings` puts a door in the middle of every shared wall, which is right often enough
 * to look plausible but is a guess. Where the drawing shows a door, this moves it to where it
 * really is: the read position is mapped into solved metres, matched to the nearest wall of
 * the room it belongs to, and converted to a position along that wall.
 *
 * Openings that cannot be matched to a wall are dropped rather than forced — a misplaced door
 * is worse than an inferred one.
 */
function applyReadOpenings(
  rooms: PlanRoom[],
  reading: AiPlanReading,
  scale: { x: number; y: number },
  fallbackUnit: 'ft' | 'm'
): void {
  const byName = new Map<string, PlanRoom>();
  reading.rooms.forEach((room, index) => {
    const target = rooms[index];
    if (target) byName.set(room.name, target);
  });

  const replaced = new Set<string>();

  for (const opening of reading.openings) {
    const room = byName.get(opening.roomA);
    if (!room) continue;

    const point: Vec2 = { x: opening.at.x * scale.x, z: opening.at.y * scale.y };
    const match = nearestWall(room, point);
    if (!match) continue;

    // The first read opening for a room clears the inferred ones; later ones add to it.
    if (!replaced.has(room.id)) {
      room.openings = [];
      replaced.add(room.id);
    }

    const widthM =
      parseLength(opening.widthLabel ?? '', fallbackUnit)?.metres ??
      (opening.kind === 'window' ? 1.4 : opening.kind === 'archway' ? 1.6 : 0.85);

    const neighbour = opening.roomB ? byName.get(opening.roomB) : null;

    room.openings.push({
      id: `${room.id}-${opening.kind}-${room.openings.length}`,
      kind: opening.kind,
      wallIndex: match.index,
      t: match.t,
      widthM: Math.min(widthM, match.length - 0.2),
      heightM: opening.kind === 'window' ? 1.4 : opening.kind === 'archway' ? 2.2 : 2.05,
      sillM: opening.kind === 'window' ? 0.9 : 0,
      roomId: room.id,
      connectsToRoomId: neighbour?.id ?? null,
      exterior: !neighbour,
    } satisfies Opening);
  }
}

/** The wall of `room` closest to `point`, with how far along it the point falls. */
function nearestWall(
  room: PlanRoom,
  point: Vec2
): { index: number; t: number; length: number } | null {
  let best: { index: number; t: number; length: number } | null = null;
  let bestDistance = Infinity;

  for (const edge of roomEdges(room.polygon)) {
    const dx = edge.b.x - edge.a.x;
    const dz = edge.b.z - edge.a.z;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq < 1e-9) continue;

    const t = clamp01(((point.x - edge.a.x) * dx + (point.z - edge.a.z) * dz) / lengthSq);
    const distance = Math.hypot(
      point.x - (edge.a.x + dx * t),
      point.z - (edge.a.z + dz * t)
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      best = { index: edge.index, t, length: edge.length };
    }
  }

  // A door read half a room away from any wall is a misread, not a door.
  return best && bestDistance < 1.2 ? best : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export { detectUnitSystem };
