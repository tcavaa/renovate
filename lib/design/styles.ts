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

import type { StyleDefinition, StyleId } from './types';

export const STYLE_IDS: StyleId[] = ['modern', 'scandinavian', 'industrial', 'vintage'];

const T = '/textures';

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
        textureUrl: `${T}/wood-floor-grey-diffuse.jpg`,
        textureScaleM: 1.6,
        roughness: 0.55,
        metalness: 0,
      },
      wall: {
        colorHex: '#F4F4F2',
        textureUrl: `${T}/plaster-vintage.jpg`,
        textureScaleM: 2.4,
        roughness: 0.95,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#B4B7B9',
        textureUrl: `${T}/concrete.jpg`,
        textureScaleM: 2.6,
        roughness: 0.9,
        metalness: 0,
      },
      ceiling: { colorHex: '#FBFBFA', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#8E9194', textureUrl: `${T}/ph-floor_tiles_08-diffuse.jpg`, normalUrl: `${T}/ph-floor_tiles_08-normal.jpg`, roughnessUrl: `${T}/ph-floor_tiles_08-rough.jpg`, textureScaleM: 1.5, roughness: 0.35, metalness: 0 },
      wetWall: { colorHex: '#DCDEDF', textureUrl: `${T}/acg-Tiles133A-diffuse.jpg`, normalUrl: `${T}/acg-Tiles133A-normal.jpg`, roughnessUrl: `${T}/acg-Tiles133A-rough.jpg`, textureScaleM: 1.2, roughness: 0.25, metalness: 0 },
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
        textureUrl: `${T}/wood-floor-light-diffuse.jpg`,
        normalUrl: `${T}/wood-floor-light-normal.jpg`,
        roughnessUrl: `${T}/wood-floor-light-rough.jpg`,
        textureScaleM: 1.4,
        roughness: 0.6,
        metalness: 0,
      },
      wall: {
        colorHex: '#F7F4EF',
        textureUrl: `${T}/plaster-warm.jpg`,
        textureScaleM: 2.8,
        roughness: 0.97,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#DCE3E1',
        textureUrl: `${T}/plaster-warm.jpg`,
        textureScaleM: 2.8,
        roughness: 0.97,
        metalness: 0,
      },
      ceiling: { colorHex: '#FFFDF9', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#CFC9BE', textureUrl: `${T}/ph-terrazzo_tiles-diffuse.jpg`, normalUrl: `${T}/ph-terrazzo_tiles-normal.jpg`, roughnessUrl: `${T}/ph-terrazzo_tiles-rough.jpg`, textureScaleM: 2, roughness: 0.4, metalness: 0 },
      wetWall: { colorHex: '#F1EDE5', textureUrl: `${T}/acg-Tiles071-diffuse.jpg`, normalUrl: `${T}/acg-Tiles071-normal.jpg`, roughnessUrl: `${T}/acg-Tiles071-rough.jpg`, textureScaleM: 1, roughness: 0.3, metalness: 0 },
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
        textureUrl: `${T}/wood-floor-dark-diffuse.jpg`,
        textureScaleM: 1.8,
        roughness: 0.65,
        metalness: 0,
      },
      wall: {
        colorHex: '#B4B7B9',
        textureUrl: `${T}/concrete.jpg`,
        textureScaleM: 3,
        roughness: 0.95,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#8A4A2B',
        textureUrl: `${T}/brick-03-diffuse.jpg`,
        normalUrl: `${T}/brick-03-normal.jpg`,
        textureScaleM: 2.2,
        roughness: 0.9,
        metalness: 0,
      },
      ceiling: { colorHex: '#D6D6D4', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#54585B', textureUrl: `${T}/ph-slate_floor-diffuse.jpg`, normalUrl: `${T}/ph-slate_floor-normal.jpg`, roughnessUrl: `${T}/ph-slate_floor-rough.jpg`, textureScaleM: 2.3, roughness: 0.45, metalness: 0 },
      wetWall: { colorHex: '#6E7275', textureUrl: `${T}/ph-tiled_floor_001-diffuse.jpg`, normalUrl: `${T}/ph-tiled_floor_001-normal.jpg`, roughnessUrl: `${T}/ph-tiled_floor_001-rough.jpg`, textureScaleM: 1.5, roughness: 0.5, metalness: 0 },
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
        textureUrl: `${T}/wood-floor-warm-diffuse.jpg`,
        normalUrl: `${T}/wood-floor-warm-normal.jpg`,
        textureScaleM: 1.5,
        roughness: 0.6,
        metalness: 0,
      },
      wall: {
        colorHex: '#EFE7D8',
        textureUrl: `${T}/plaster-vintage.jpg`,
        textureScaleM: 2.5,
        roughness: 0.95,
        metalness: 0,
      },
      featureWall: {
        colorHex: '#DCD3BC',
        textureUrl: `${T}/wallpaper-vintage.jpg`,
        textureScaleM: 1.2,
        roughness: 0.95,
        metalness: 0,
      },
      ceiling: { colorHex: '#FBF6EC', roughness: 1, metalness: 0 },
      wetFloor: { colorHex: '#B9A78A', textureUrl: `${T}/ph-floor_tiles_06-diffuse.jpg`, normalUrl: `${T}/ph-floor_tiles_06-normal.jpg`, roughnessUrl: `${T}/ph-floor_tiles_06-rough.jpg`, textureScaleM: 3, roughness: 0.4, metalness: 0 },
      wetWall: { colorHex: '#E8DFCB', textureUrl: `${T}/acg-Tiles032-diffuse.jpg`, normalUrl: `${T}/acg-Tiles032-normal.jpg`, roughnessUrl: `${T}/acg-Tiles032-rough.jpg`, textureScaleM: 1, roughness: 0.35, metalness: 0 },
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

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && (STYLE_IDS as string[]).includes(value);
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
