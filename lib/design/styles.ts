/**
 * The four interior styles the Design Studio offers.
 *
 * This is the single source of truth for style identity: the DB tags products against these
 * ids (`products.styleTags`), the 3D material factory reads the palettes and surfaces
 * (`lib/design3d/materials.ts`), and the style picker renders the swatches.
 *
 * The textures are the real PBR maps that came with the partner asset drop —
 * see `scripts/extract-assets.sh`.
 */

import type { StyleDefinition, StyleId, StyleSurface } from './types';

export const STYLE_IDS: StyleId[] = ['modern', 'scandinavian', 'industrial', 'vintage'];

const T = '/textures';

/**
 * The interior paints the styles colour their rooms in — catalogue products (`paint-<name>`,
 * written by `pnpm textures:stock`, which colours one plaster texture to each of these), so a
 * painted bedroom is a tin of paint in the budget. The one place the colours are defined.
 */
export const PAINT_COLORS = {
  white: '#F1F0EB',
  'warm-white': '#F0E9DD',
  greige: '#D5CEC3',
  'light-grey': '#D2D5D5',
  'warm-grey': '#B8B2A8',
  slate: '#8B9094',
  taupe: '#C3B6A7',
  sage: '#C2CCB9',
  'dusty-blue': '#BCC8CF',
  'dusty-rose': '#D7BCB1',
  cream: '#ECE1C8',
  olive: '#959E86',
} as const;
export type PaintName = keyof typeof PAINT_COLORS;

/** The plaster every paint is coloured from; its relief and roughness are every paint's. */
export const PAINT_BASE_TEXTURE = 'acg-Plaster002';

/** A paint as a look: its texture, the plaster's maps, matt. */
export function paintLook(name: PaintName): StyleSurface {
  return {
    colorHex: PAINT_COLORS[name],
    textureUrl: `${T}/paint-${name}-diffuse.webp`,
    normalUrl: `${T}/${PAINT_BASE_TEXTURE}-normal.webp`,
    roughnessUrl: `${T}/${PAINT_BASE_TEXTURE}-rough.webp`,
    textureScaleM: 2,
    roughness: 0.95,
    metalness: 0,
  };
}

/** A finish product's texture with its own maps beside it, at its own repeat. */
const product = (name: string, colorHex: string, textureScaleM: number, roughness: number, maps: { normal?: boolean; rough?: boolean } = { normal: true, rough: true }): StyleSurface => ({
  colorHex,
  textureUrl: `${T}/${name}-diffuse.webp`,
  ...(maps.normal ? { normalUrl: `${T}/${name}-normal.webp` } : {}),
  ...(maps.rough ? { roughnessUrl: `${T}/${name}-rough.webp` } : {}),
  textureScaleM,
  roughness,
  metalness: 0,
});

/** The floors and walls the styles lay by room, each the look of a `textures:stock` product. */
const LOOKS = {
  porcelain: product('ph-floor_tiles_08', '#B5A592', 1.5, 0.4),
  microcement: product('acg-Concrete034', '#BDBDBB', 2.5, 0.6),
  terrazzo: product('ph-terrazzo_tiles', '#CFC9BE', 2, 0.45),
  terracotta: product('ph-terracotta_floor_tiles', '#8A4E37', 2.08, 0.55),
  slate: product('ph-slate_floor', '#3A3333', 2.3, 0.45),
  checkerboard: product('ph-floor_tiles_06', '#9C9089', 3, 0.4),
  herringbone: product('ph-herringbone_parquet', '#A07B55', 3.4, 0.6),
  parquet: product('ph-rectangular_parquet', '#80603A', 2.25, 0.6),
  brick: product('brick-01', '#8A4A2B', 1.2, 0.9, { normal: true }),
  concrete: { colorHex: '#B4B7B9', textureUrl: `${T}/concrete.webp`, textureScaleM: 3, roughness: 0.95, metalness: 0 } satisfies StyleSurface,
  wallpaper: { colorHex: '#DCD3BC', textureUrl: `${T}/wallpaper-vintage.webp`, textureScaleM: 1.2, roughness: 0.95, metalness: 0 } satisfies StyleSurface,
};

/**
 * The outside of the flat's walls, in every style: the building's brick (the exposed red brick
 * finish's texture). Seen with every wall up from outside; nobody paints it, so it is no
 * product and never priced. A balcony's outside is left as it was — the balcony is the
 * person's to finish.
 */
export const FACADE_LOOK: StyleSurface = LOOKS.brick;

export const STYLES: Record<StyleId, StyleDefinition> = {
  // -------------------------------------------------------------------------
  modern: {
    id: 'modern',
    assetFolder: 'MODERN',
    tags: ['modern', 'minimalist', 'contemporary', 'თანამედროვე', 'მინიმალისტური'],
    swatches: ['#2E3238', '#F4F4F2', '#B9BDC2', '#C9A227'],
    palette: {
      frame: '#2E3238',
      upholstery: '#8D9298',
      wood: '#A79684',
      metal: '#C7CBD0',
      accent: '#C9A227',
      textile: '#DEDCD7',
    },
    surfaces: {
      floor: {
        colorHex: '#A79684',
        textureUrl: `${T}/wood-floor-grey-diffuse.webp`,
        textureScaleM: 1.6,
        roughness: 0.55,
        metalness: 0,
      },
      wall: {
        colorHex: '#F4F4F2',
        textureUrl: `${T}/plaster-vintage.webp`,
        textureScaleM: 2.4,
        roughness: 0.95,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#B4B7B9',
        textureUrl: `${T}/concrete.webp`,
        textureScaleM: 2.6,
        roughness: 0.9,
        metalness: 0,
      },
      ceiling: { colorHex: '#FBFBFA', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#8E9194', textureUrl: `${T}/ph-floor_tiles_08-diffuse.webp`, normalUrl: `${T}/ph-floor_tiles_08-normal.webp`, roughnessUrl: `${T}/ph-floor_tiles_08-rough.webp`, textureScaleM: 1.5, roughness: 0.35, metalness: 0 },
      wetWall: { colorHex: '#DCDEDF', textureUrl: `${T}/acg-Tiles133A-diffuse.webp`, normalUrl: `${T}/acg-Tiles133A-normal.webp`, roughnessUrl: `${T}/acg-Tiles133A-rough.webp`, textureScaleM: 1.2, roughness: 0.25, metalness: 0 },
    },
    // Warm greys and white, the floors in large-format tile where they get wet or walked on.
    rooms: {
      living_room: { wall: paintLook('greige') },
      studio: { wall: paintLook('greige') },
      bedroom: { wall: paintLook('taupe') },
      kitchen: { wall: paintLook('white'), floor: LOOKS.porcelain },
      hallway: { wall: paintLook('light-grey'), floor: LOOKS.microcement },
      office: { wall: paintLook('light-grey') },
      balcony: { wall: paintLook('white'), floor: LOOKS.porcelain },
      storage: { wall: paintLook('light-grey'), floor: LOOKS.microcement },
      closet: { wall: paintLook('light-grey') },
    },
    lighting: {
      ambient: '#EDF1F5',
      ambientIntensity: 0.75,
      lamp: '#FFF3DC',
      sun: '#FFFAF0',
      sunIntensity: 1.5,
    },
  },

  // -------------------------------------------------------------------------
  scandinavian: {
    id: 'scandinavian',
    assetFolder: 'SCANDINAVIAN',
    tags: ['scandinavian', 'nordic', 'minimalist', 'light', 'სკანდინავიური'],
    swatches: ['#D8B98C', '#F7F4EF', '#9BA7A5', '#6E8B8C'],
    palette: {
      frame: '#D8B98C',
      upholstery: '#C9CCC6',
      wood: '#DDBE90',
      metal: '#B7B2A8',
      accent: '#6E8B8C',
      textile: '#EDE7DC',
    },
    surfaces: {
      floor: {
        colorHex: '#DDBE90',
        textureUrl: `${T}/wood-floor-light-diffuse.webp`,
        normalUrl: `${T}/wood-floor-light-normal.webp`,
        roughnessUrl: `${T}/wood-floor-light-rough.webp`,
        textureScaleM: 1.4,
        roughness: 0.6,
        metalness: 0,
      },
      wall: {
        colorHex: '#F7F4EF',
        textureUrl: `${T}/plaster-warm.webp`,
        textureScaleM: 2.8,
        roughness: 0.97,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#DCE3E1',
        textureUrl: `${T}/plaster-warm.webp`,
        textureScaleM: 2.8,
        roughness: 0.97,
        metalness: 0,
      },
      ceiling: { colorHex: '#FFFDF9', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#CFC9BE', textureUrl: `${T}/ph-terrazzo_tiles-diffuse.webp`, normalUrl: `${T}/ph-terrazzo_tiles-normal.webp`, roughnessUrl: `${T}/ph-terrazzo_tiles-rough.webp`, textureScaleM: 2, roughness: 0.4, metalness: 0 },
      wetWall: { colorHex: '#F1EDE5', textureUrl: `${T}/acg-Tiles071-diffuse.webp`, normalUrl: `${T}/acg-Tiles071-normal.webp`, roughnessUrl: `${T}/acg-Tiles071-rough.webp`, textureScaleM: 1, roughness: 0.3, metalness: 0 },
    },
    // Warm white with soft colour where people rest and work, terrazzo underfoot in the kitchen and hall.
    rooms: {
      living_room: { wall: paintLook('warm-white') },
      studio: { wall: paintLook('warm-white') },
      bedroom: { wall: paintLook('sage') },
      kitchen: { wall: paintLook('warm-white'), floor: LOOKS.terrazzo },
      hallway: { wall: paintLook('greige'), floor: LOOKS.terrazzo },
      office: { wall: paintLook('dusty-blue') },
      balcony: { wall: paintLook('warm-white'), floor: LOOKS.terracotta },
      storage: { wall: paintLook('warm-white'), floor: LOOKS.terrazzo },
      closet: { wall: paintLook('warm-white') },
    },
    lighting: {
      ambient: '#F4F1EA',
      ambientIntensity: 0.9,
      lamp: '#FFEFD0',
      sun: '#FFF6E6',
      sunIntensity: 1.7,
    },
  },

  // -------------------------------------------------------------------------
  industrial: {
    id: 'industrial',
    assetFolder: 'INDUSTRIAL',
    tags: ['industrial', 'loft', 'brick', 'metal', 'ინდუსტრიული', 'ლოფტი'],
    swatches: ['#1F2124', '#8A4A2B', '#7C4A32', '#9A9DA0'],
    palette: {
      frame: '#1F2124',
      upholstery: '#7C4A32',
      wood: '#6B4A32',
      metal: '#4A4E52',
      accent: '#B5651D',
      textile: '#5C5F63',
    },
    surfaces: {
      floor: {
        colorHex: '#6B4A32',
        textureUrl: `${T}/wood-floor-dark-diffuse.webp`,
        textureScaleM: 1.8,
        roughness: 0.65,
        metalness: 0,
      },
      wall: {
        colorHex: '#B4B7B9',
        textureUrl: `${T}/concrete.webp`,
        textureScaleM: 3,
        roughness: 0.95,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#8A4A2B',
        textureUrl: `${T}/brick-03-diffuse.webp`,
        normalUrl: `${T}/brick-03-normal.webp`,
        textureScaleM: 2.2,
        roughness: 0.9,
        metalness: 0,
      },
      ceiling: { colorHex: '#D6D6D4', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#54585B', textureUrl: `${T}/ph-slate_floor-diffuse.webp`, normalUrl: `${T}/ph-slate_floor-normal.webp`, roughnessUrl: `${T}/ph-slate_floor-rough.webp`, textureScaleM: 2.3, roughness: 0.45, metalness: 0 },
      wetWall: { colorHex: '#6E7275', textureUrl: `${T}/ph-tiled_floor_001-diffuse.webp`, normalUrl: `${T}/ph-tiled_floor_001-normal.webp`, roughnessUrl: `${T}/ph-tiled_floor_001-rough.webp`, textureScaleM: 1.5, roughness: 0.5, metalness: 0 },
    },
    // Greys from warm to slate, concrete and brick where they are the room's character, microcement floors.
    rooms: {
      living_room: { wall: paintLook('warm-grey') },
      studio: { wall: paintLook('warm-grey') },
      bedroom: { wall: paintLook('slate') },
      kitchen: { wall: paintLook('light-grey'), floor: LOOKS.microcement },
      hallway: { wall: LOOKS.concrete, floor: LOOKS.microcement },
      office: { wall: LOOKS.brick },
      balcony: { wall: paintLook('warm-grey'), floor: LOOKS.slate },
      storage: { wall: paintLook('light-grey'), floor: LOOKS.microcement },
      closet: { wall: paintLook('light-grey') },
    },
    lighting: {
      ambient: '#DDE1E6',
      ambientIntensity: 0.6,
      lamp: '#FFD9A0',
      sun: '#FFF2DC',
      sunIntensity: 1.35,
    },
  },

  // -------------------------------------------------------------------------
  vintage: {
    id: 'vintage',
    assetFolder: 'VINTAGE',
    tags: ['vintage', 'classic', 'retro', 'rustic', 'ვინტაჟი', 'კლასიკური'],
    swatches: ['#5A3A24', '#B08D57', '#3F5E4B', '#7C2F3B'],
    palette: {
      frame: '#5A3A24',
      upholstery: '#3F5E4B',
      wood: '#6E4526',
      metal: '#B08D57',
      accent: '#7C2F3B',
      textile: '#C7B191',
    },
    surfaces: {
      floor: {
        colorHex: '#8A6136',
        textureUrl: `${T}/wood-floor-warm-diffuse.webp`,
        normalUrl: `${T}/wood-floor-warm-normal.webp`,
        textureScaleM: 1.5,
        roughness: 0.6,
        metalness: 0,
      },
      wall: {
        colorHex: '#EFE7D8',
        textureUrl: `${T}/plaster-vintage.webp`,
        textureScaleM: 2.5,
        roughness: 0.95,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#DCD3BC',
        textureUrl: `${T}/wallpaper-vintage.webp`,
        textureScaleM: 1.2,
        roughness: 0.95,
        metalness: 0,
      },
      ceiling: { colorHex: '#FBF6EC', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#B9A78A', textureUrl: `${T}/ph-floor_tiles_06-diffuse.webp`, normalUrl: `${T}/ph-floor_tiles_06-normal.webp`, roughnessUrl: `${T}/ph-floor_tiles_06-rough.webp`, textureScaleM: 3, roughness: 0.4, metalness: 0 },
      wetWall: { colorHex: '#E8DFCB', textureUrl: `${T}/acg-Tiles032-diffuse.webp`, normalUrl: `${T}/acg-Tiles032-normal.webp`, roughnessUrl: `${T}/acg-Tiles032-rough.webp`, textureScaleM: 1, roughness: 0.35, metalness: 0 },
    },
    // Cream, dusty rose and olive, parquet in the living room, a chequered kitchen, terracotta and wallpaper in the hall.
    rooms: {
      living_room: { wall: paintLook('cream'), floor: LOOKS.herringbone },
      studio: { wall: paintLook('cream'), floor: LOOKS.herringbone },
      bedroom: { wall: paintLook('dusty-rose') },
      kitchen: { wall: paintLook('cream'), floor: LOOKS.checkerboard },
      hallway: { wall: LOOKS.wallpaper, floor: LOOKS.terracotta },
      office: { wall: paintLook('olive'), floor: LOOKS.parquet },
      balcony: { wall: paintLook('cream'), floor: LOOKS.terracotta },
      storage: { wall: paintLook('cream'), floor: LOOKS.terracotta },
      closet: { wall: paintLook('cream') },
    },
    lighting: {
      ambient: '#F3E9D8',
      ambientIntensity: 0.7,
      lamp: '#FFD9A0',
      sun: '#FFEFD4',
      sunIntensity: 1.4,
    },
  },
};

export function getStyle(id: StyleId | string | null | undefined): StyleDefinition {
  if (id && id in STYLES) return STYLES[id as StyleId];
  return STYLES.scandinavian;
}

/**
 * How well a product's tags match a style.
 *   2 = explicitly tagged with this style
 *   1 = tagged with one of the style's adjacent keywords
 *   0 = no signal (still selectable, just ranked last)
 */
export function styleAffinity(
  styleId: StyleId,
  productStyleTags: unknown,
  productTags: unknown
): number {
  const style = STYLES[styleId];
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const styleTags = asList(productStyleTags).map((t) => t.toLowerCase());
  if (styleTags.includes(styleId)) return 2;

  const generic = asList(productTags).map((t) => t.toLowerCase());
  const keywords = style.tags.map((t) => t.toLowerCase());
  const hit = [...styleTags, ...generic].some((t) => keywords.includes(t));
  return hit ? 1 : 0;
}
