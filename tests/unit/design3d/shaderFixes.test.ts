import { describe, expect, it } from 'vitest';
import { ShaderChunk } from 'three';
import { applyShaderFixes, SHADER_PATCHES } from '@/lib/design3d/shaderFixes';

/**
 * Normal-mapped models with collapsed UVs, or zero vertex normals, shaded to NaN: white specks
 * in the studio, black blocks under any blur. The guards live in three's shared chunks.
 */
describe('shader fixes', () => {
  it('guards every chunk it patches (and still finds its anchors in this three)', () => {
    for (const { chunk, from, to } of SHADER_PATCHES) {
      expect(ShaderChunk[chunk]).toContain(to);
      expect(ShaderChunk[chunk]).not.toContain(from);
    }
  });

  it('trusts no tangent frame below the threshold and keeps a zero-length normal finite', () => {
    expect(ShaderChunk.normalmap_pars_fragment).toMatch(/det < 1e-24/);
    expect(ShaderChunk.normal_fragment_maps).toMatch(/dot\( mappedNormal, mappedNormal \) > 1e-12/);
    expect(ShaderChunk.normal_fragment_begin).toMatch(/dot\( vNormal, vNormal \) > 1e-12/);
  });

  it('applies once', () => {
    expect(applyShaderFixes()).toBe(0);
  });
});
