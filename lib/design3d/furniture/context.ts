import type * as THREE from 'three';
import type { Size3 } from '@/lib/design/catalog';
import type { StyleDefinition, StyleId } from '@/lib/design/types';
import type { StyleMaterials } from '../materials';
import type { LegStyle } from '../primitives';

/** Everything a furniture builder is given. */
export interface BuildContext {
  /** The size the layout engine actually allocated, in metres. Builders must respect it. */
  size: Size3;
  style: StyleDefinition;
  materials: StyleMaterials;
  /** The real product's colour, when one is known — overrides the palette. */
  colorHex?: string | null;
  /** Deterministic per-item seed, so decorative randomness never reshuffles on re-render. */
  seed: number;
}

export type FurnitureBuilder = (ctx: BuildContext) => THREE.Object3D;

/**
 * Leg treatment per style.
 *
 * This one detail carries a surprising amount of the style read: splayed tapered legs say
 * Scandinavian, black hairpins say industrial loft, a recessed plinth says modern, turned
 * tapered legs say vintage.
 */
export function legStyleFor(styleId: StyleId): LegStyle {
  switch (styleId) {
    case 'modern':
      return 'plinth';
    case 'scandinavian':
      return 'splayed';
    case 'industrial':
      return 'hairpin';
    case 'vintage':
      return 'tapered';
    default:
      return 'square';
  }
}

/** Corner softness per style — modern is crisp, vintage is round. */
export function radiusFor(styleId: StyleId): number {
  switch (styleId) {
    case 'modern':
      return 0.025;
    case 'scandinavian':
      return 0.06;
    case 'industrial':
      return 0.04;
    case 'vintage':
      return 0.09;
    default:
      return 0.05;
  }
}
