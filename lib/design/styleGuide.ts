/**
 * The four styles as the owner's brief describes them (docs/design-studio/design-rules.md, part
 * 4): each style's shared look — palette, materials, lighting, furniture, kitchen, walls — and the
 * sub-styles inside it. The AI designer is given the guide and one sub-style as the flat's
 * direction (`styleGuideText`, `subStyleFor`); the matcher favours products whose colours and
 * materials fit the style (`guideFit`). The app's own style ids are the brief's four.
 *
 * English, because it is written for the model; what the person reads is in the dictionaries.
 * Pure.
 */

import { productColorFamilies, type ColorFamily } from './colors';
import type { Rng } from './random';
import type { StyleId, StyleProfile } from './types';

export interface StyleNotes {
  palette: string;
  materials: string;
  lighting?: string;
  furniture?: string;
  kitchen?: string;
  walls?: string;
  feel?: string;
}

export interface SubStyle extends StyleNotes {
  id: string;
  name: string;
  /**
   * How much each answer of the style test (`lib/design/styleQuiz`, by option id) points to it;
   * the sub-style the answers point to most is the flat's.
   */
  cues: Record<string, number>;
}

export interface StyleGuide extends StyleNotes {
  look: string;
  /** The colour families its palette is made of (`lib/design/colors`): a product in one fits. */
  families: ColorFamily[];
  /** Words a fitting product's name or tags carry: its materials. */
  materialWords: string[];
  subStyles: SubStyle[];
}

export const STYLE_GUIDES: Record<StyleId, StyleGuide> = {
  scandinavian: {
    look: 'light colours only, natural materials, calm and uncluttered, lots of daylight',
    palette: 'whites, greige, soft beige, pale grey',
    materials: 'pale oak or birch, linen, wool, bouclé',
    lighting: 'soft paper lanterns, warm diffused light',
    furniture: 'a low, simple sofa in linen or bouclé; a low platform bed with white linen',
    kitchen: 'handleless pale cabinets and clear counters',
    walls: 'mostly bare walls with one ceramic or a branch, nearly empty shelves',
    feel: 'quiet, slow, at home — a weekend feel',
    families: ['white', 'beige', 'grey'],
    materialWords: ['oak', 'birch', 'ash', 'pine', 'linen', 'wool', 'boucle', 'bouclé', 'paper', 'rattan', 'cotton'],
    subStyles: [{ id: 'scandinavian', name: 'Scandinavian', palette: 'whites, greige, soft beige, pale grey', materials: 'pale oak, birch, linen, wool', cues: {} }],
  },
  industrial: {
    look: 'raw, textured and masculine, with exposed structure; wood and textiles keep the cold surfaces from feeling harsh',
    palette: 'grey, black, and tan or cognac leather',
    materials: 'raw concrete, rustic leather, steel or black iron, with exposed brick and reclaimed wood for warmth',
    lighting: 'black metal pendants, exposed bulbs, track lights',
    kitchen: 'concrete or dark counters, steel fixtures, open shelves',
    families: ['grey', 'black', 'brown', 'red'],
    materialWords: ['concrete', 'cement', 'leather', 'steel', 'iron', 'metal', 'brick', 'reclaimed', 'walnut', 'loft'],
    subStyles: [
      {
        id: 'urban-industrial',
        name: 'Urban industrial',
        palette: 'grey, black, tan or cognac leather',
        materials: 'raw concrete, rustic leather, steel or black iron, reclaimed wood',
        lighting: 'black metal pendants, exposed bulbs, track lights',
        kitchen: 'concrete or dark counters, steel fixtures, open shelves',
        feel: 'add wood and textiles so the cold surfaces do not feel harsh',
        cues: { workshop: 2, bulbs: 1, graphite: 1 },
      },
      {
        id: 'loft',
        name: 'Loft',
        palette: 'brick red, grey, black, tan',
        materials: 'exposed brick, a concrete floor, steel-framed windows, dark leather',
        lighting: 'black metal pendants, exposed bulbs, track lights',
        kitchen: 'open plan, steel or dark counters, a kitchen island, open shelves',
        walls: 'brick or concrete, large abstract art or posters',
        cues: { brick: 2, loft: 2, bulbs: 1 },
      },
      {
        id: 'concrete-minimal',
        name: 'Concrete minimal',
        palette: 'all shades of grey and black, with very few accents',
        materials: 'poured concrete or microcement on walls, floors and counters, plus black steel',
        furniture: 'simple and heavy, few pieces',
        lighting: 'recessed or linear lights, a single sculptural fixture',
        feel: 'concrete looks cold, so add wood or textiles in at least one zone',
        cues: { concrete: 2, hidden: 1, gallery: 1, glass: 1 },
      },
    ],
  },
  modern: {
    look: 'sleek and polished, clean lines, curated and not crowded',
    palette: 'charcoal and navy, with a pop of accent colour',
    materials: 'walnut, brass, leather',
    furniture: 'a clean-lined sofa and an upholstered headboard',
    kitchen: 'flat-panel cabinets, a waterfall island, black fixtures',
    lighting: 'a sculptural arc lamp or a bold pendant',
    walls: 'one large abstract piece, a few curated objects',
    families: ['black', 'grey', 'blue', 'brown', 'yellow', 'green', 'white'],
    materialWords: ['walnut', 'teak', 'brass', 'leather', 'marble', 'glass', 'lacquer', 'velvet'],
    subStyles: [
      {
        id: 'contemporary',
        name: 'Contemporary',
        palette: 'charcoal and navy, with a pop of accent colour',
        materials: 'walnut, brass, leather',
        furniture: 'a clean-lined sofa, an upholstered headboard',
        kitchen: 'flat-panel cabinets, a waterfall island, black fixtures',
        lighting: 'a sculptural arc lamp or a bold pendant',
        walls: 'one large abstract piece, a few curated objects',
        cues: { graphite: 2, glass: 2, sleek: 2, hidden: 1, gallery: 2 },
      },
      {
        id: 'mid-century',
        name: 'Mid-century modern',
        palette: 'charcoal, navy, olive, mustard',
        materials: 'walnut and teak, brass, leather',
        furniture: 'clean lines with tapered legs',
        feel: 'a softer mix of classic and modern',
        cues: { walnut: 1, oak: 1, wool: 1, light: 1, paper: 1, hygge: 1 },
      },
    ],
  },
  vintage: {
    look: 'warm and layered, with character and history: furniture and decor have age, craft or heritage',
    palette: 'cream, dusty blue, gold, burgundy',
    materials: 'mahogany, marble, silk, painted wood, linen, aged mirrors',
    families: ['beige', 'blue', 'yellow', 'red', 'green', 'brown', 'white'],
    materialWords: ['mahogany', 'marble', 'silk', 'velvet', 'linen', 'brass', 'gilded', 'carved', 'rattan', 'terracotta', 'wool', 'reclaimed', 'iron', 'tufted', 'chesterfield'],
    subStyles: [
      {
        id: 'traditional',
        name: 'Traditional',
        palette: 'cream, dusty blue, gold, burgundy',
        materials: 'mahogany, marble, silk',
        furniture: 'a rolled-arm or tufted camelback sofa, a canopy or carved bed',
        kitchen: 'inset cabinets, marble, brass hardware',
        lighting: 'a crystal chandelier and sconces',
        walls: 'moulding, framed portraits, gilded mirrors, symmetrical collections',
        cues: { carved: 2, chandelier: 2, walnut: 1, velvet: 1 },
      },
      {
        id: 'french-country',
        name: 'French country',
        palette: 'soft, muted tones like cream and dusty blue',
        materials: 'painted wood, linen, aged mirrors',
        feel: 'elegant but lighter and softer than traditional',
        cues: { oak: 1, wool: 1, light: 1, paper: 1, hygge: 1 },
      },
      {
        id: 'farmhouse',
        name: 'Farmhouse',
        palette: 'barn red, forest green, weathered grey',
        materials: 'reclaimed wood, iron, wool',
        furniture: 'a deep, slipcovered, oversized sofa; a quilt on a wood or iron bed frame',
        kitchen: 'open shelves, an apron sink, butcher block',
        lighting: 'a wrought-iron chandelier or lanterns',
        walls: 'shiplap, quilts, vintage signs',
        cues: { brick: 1, workshop: 1, bulbs: 1, wool: 1 },
      },
      {
        id: 'bohemian',
        name: 'Bohemian',
        palette: 'cobalt, saffron, coral, emerald',
        materials: 'rattan, terracotta, velvet',
        furniture: 'a curved velvet sofa with mixed-pattern cushions, layered rugs and drapes',
        kitchen: 'zellige tile and colourful ceramics',
        lighting: 'woven pendants and Moroccan lanterns',
        walls: 'a gallery wall and tapestries',
        cues: { velvet: 2, collected: 2 },
      },
    ],
  },
};

/**
 * The sub-style for a flat: the one the style test's answers point to most (ties to the first),
 * or — chosen straight from the plates, or no answers — one drawn with `rng` (the first without).
 */
export function subStyleFor(styleId: StyleId, profile: StyleProfile | null | undefined, rng?: Rng): SubStyle {
  const subs = STYLE_GUIDES[styleId].subStyles;
  const answers = profile && !profile.direct ? Object.values(profile.answers ?? {}) : [];
  if (answers.length > 0) {
    const score = (s: SubStyle) => answers.reduce((sum, a) => sum + (s.cues[a] ?? 0), 0);
    const best = subs.reduce((top, s) => (score(s) > score(top) ? s : top), subs[0]);
    if (score(best) > 0) return best;
  }
  return rng ? subs[Math.floor(rng() * subs.length)] : subs[0];
}

function notes(n: StyleNotes): string {
  return [
    `palette: ${n.palette}`,
    `materials: ${n.materials}`,
    n.furniture && `furniture: ${n.furniture}`,
    n.kitchen && `kitchen: ${n.kitchen}`,
    n.lighting && `lighting: ${n.lighting}`,
    n.walls && `walls: ${n.walls}`,
    n.feel && `feel: ${n.feel}`,
  ]
    .filter(Boolean)
    .join('; ');
}

/** The guide for the model: the style's shared look, then the flat's sub-style. */
export function styleGuideText(styleId: StyleId, sub: SubStyle): string {
  const guide = STYLE_GUIDES[styleId];
  const lines = [`Style guide — ${styleId}: ${guide.look}. ${notes(guide)}.`];
  if (guide.subStyles.length > 1) lines.push(`This flat's sub-style: ${sub.name} — ${notes(sub)}.`);
  return lines.join('\n');
}

/**
 * How well a product fits the style's guide, as a weight on the matcher's draw: a colour of the
 * style's palette and a material of its own each make it likelier; nothing known, no change.
 */
export function guideFit(product: { colorHex?: string | null; specs?: unknown; nameEn?: string | null; tags?: unknown }, styleId: StyleId): number {
  const guide = STYLE_GUIDES[styleId];
  const families = productColorFamilies(product);
  const colour = families.length > 0 && families.some((f) => guide.families.includes(f));
  const words = [product.nameEn ?? '', ...(Array.isArray(product.tags) ? product.tags.filter((t): t is string => typeof t === 'string') : [])].join(' ').toLowerCase();
  const material = guide.materialWords.some((w) => words.includes(w));
  return 1 + (colour ? 0.35 : 0) + (material ? 0.25 : 0);
}

/**
 * Whether a style keeps a product out of a generated flat (the owner's notes of 29 Oct 2026):
 * Scandinavian has no piece whose main colour is black — light, bright colours from the fridge to
 * the sofa; small black details (legs, handles) are allowed. The swap list still offers it.
 */
export function styleRejects(product: { colorHex?: string | null; specs?: unknown }, styleId: StyleId): boolean {
  if (styleId !== 'scandinavian') return false;
  return productColorFamilies(product)[0] === 'black';
}
