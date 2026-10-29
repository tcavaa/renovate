/**
 * Is the upload a floor plan at all?
 *
 * Reading a plan is the expensive call (Opus at high effort, 20 s to 2 minutes, $0.05–0.30), and
 * people upload whatever is to hand — a photo of the room, of the building, a car. A small, cheap
 * look first (Haiku at low effort on a 512 px copy, well under a tetri) refuses those before the
 * read, and the upload card asks for another file.
 *
 * It fails open: no key, an error, a refusal or an answer that does not parse all count as a plan,
 * so the check can only ever save a read, never block one.
 */

import Anthropic from '@anthropic-ai/sdk';

export const PLAN_CHECK_MODEL = 'claude-haiku-5-5';

export interface PlanCheckRequest {
  imageBase64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  /** Overrides the env key, for testing. */
  apiKey?: string;
}

export interface PlanCheck {
  isPlan: boolean;
  /** What the image shows, in a few words — logged, so a wrong refusal can be looked into. */
  depicts: string;
}

const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isPlan', 'depicts'],
  properties: {
    isPlan: { type: 'boolean', description: 'True when the image is a floor plan of a home or another building.' },
    depicts: { type: 'string', description: 'What the image shows, in a few words.' },
  },
} as const;

const CHECK_PROMPT = `You sort uploads for a home-design tool that rebuilds floor plans in 3D. Answer whether the image is a floor plan: a drawing of a home's (or another building's) layout seen from directly above, with walls between rooms. A CAD export, an estate agent's plan, a hand-drawn sketch, a scan or a photo of a printed or hand-drawn plan, and a plan with furniture drawn in it all count. A photo or render of a room or a building, a façade or section drawing, a map, a car, a person, a screenshot of something else, or a document with no layout drawn does not.`;

/** The answer as given, or a plan when the model's text is not the answer it was asked for. */
export function parseCheck(text: string): PlanCheck {
  try {
    const value = JSON.parse(text) as Partial<PlanCheck>;
    if (typeof value.isPlan !== 'boolean') return { isPlan: true, depicts: 'unreadable answer' };
    return { isPlan: value.isPlan, depicts: typeof value.depicts === 'string' ? value.depicts.slice(0, 200) : '' };
  } catch {
    return { isPlan: true, depicts: 'unreadable answer' };
  }
}

export async function checkIsPlan(request: PlanCheckRequest): Promise<PlanCheck> {
  const apiKey = request.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { isPlan: true, depicts: 'not checked' };
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: PLAN_CHECK_MODEL,
      max_tokens: 1024,
      // A yes or no about one picture: no reasoning to speak of, so no thinking and low effort.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
      system: CHECK_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: request.mediaType, data: request.imageBase64 } },
            { type: 'text', text: 'Is this a floor plan?' },
          ],
        },
      ],
    });
    // Haiku has no server-side fallback; a refusal on an upload is a false positive, and the read decides.
    if (response.stop_reason === 'refusal') return { isPlan: true, depicts: 'check declined' };
    const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return text ? parseCheck(text.text) : { isPlan: true, depicts: 'no answer' };
  } catch {
    return { isPlan: true, depicts: 'check failed' };
  }
}
