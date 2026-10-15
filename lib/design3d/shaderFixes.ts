/**
 * Three's lighting shaders, made safe against the geometry the catalogue's models really carry.
 *
 * A library model with a normal map but no tangents is shaded with three's screen-space tangent
 * frame (`getTangentFrame`), which divides by how fast the texture coordinates change across
 * the pixel. Where a part's UVs are squashed to (almost) a point — common in converted
 * models, and made worse by quantised UVs — that rate is a denormal: `det == 0.0` is false,
 * `inversesqrt(det)` is infinite, and the pixel's normal comes out NaN. So does
 * `normalize(tbn * mapN)` once the frame has collapsed, and `normalize(vNormal)` on a vertex
 * whose stored normal is zero. A NaN normal lights the pixel NaN: a white speck on the canvas,
 * a black block under any blur (bloom, a soft shadow pass). Seen on several library beds,
 * sofas, a lamp shade and a chandelier.
 *
 * The fix is three small guards in the shared shader chunks, applied once when this module is
 * first imported (before any material compiles): a collapsed tangent frame falls back to the
 * surface normal, a mapped normal of zero length keeps the unmapped one, and a zero vertex
 * normal faces the camera. Every model — stock, library, an upload — gets it without touching
 * its file.
 */

import { ShaderChunk } from 'three';

type Patch = { chunk: keyof typeof ShaderChunk; from: string; to: string };

/** The smallest tangent-frame determinant still trusted; far above a denormal, far below a real surface's. */
const MIN_FRAME_DET = '1e-24';

export const SHADER_PATCHES: Patch[] = [
  {
    chunk: 'normalmap_pars_fragment',
    from: 'float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );',
    to: `float scale = ( det < ${MIN_FRAME_DET} ) ? 0.0 : inversesqrt( det );`,
  },
  {
    chunk: 'normal_fragment_maps',
    from: 'normal = normalize( tbn * mapN );',
    to: 'vec3 mappedNormal = tbn * mapN;\n\tnormal = dot( mappedNormal, mappedNormal ) > 1e-12 ? normalize( mappedNormal ) : normal;',
  },
  {
    chunk: 'normal_fragment_begin',
    from: 'vec3 normal = normalize( vNormal );',
    // Facing the camera (view space): every material that includes the chunk has vNormal, not
    // all of them vViewPosition, so the face's own normal from derivatives is not an option.
    to: 'vec3 normal = dot( vNormal, vNormal ) > 1e-12 ? normalize( vNormal ) : vec3( 0.0, 0.0, 1.0 );',
  },
];

/** Applies the guards; returns how many chunks it changed (0 the second time). */
export function applyShaderFixes(): number {
  let changed = 0;
  for (const { chunk, from, to } of SHADER_PATCHES) {
    const source = ShaderChunk[chunk];
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      // A three upgrade rewrote the chunk: the guard needs redoing, the scene still renders.
      console.warn(`[studio] shader fix for ${chunk} no longer applies — check lib/design3d/shaderFixes.ts`);
      continue;
    }
    (ShaderChunk as Record<string, string>)[chunk] = source.replace(from, to);
    changed++;
  }
  return changed;
}

applyShaderFixes();
