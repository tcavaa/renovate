/**
 * The world around the flat: the sky, and the ground it stands on.
 *
 * The sky is a gradient behind everything — the hour's colour overhead (`Daylight.skyTop`),
 * paling to a haze at the horizon (`skyHorizon`). The ground is a light plane, lit like
 * everything else (it takes the flat's shadow and darkens at night), ruled like the 2D
 * board's sheet: half-metre cells with a darker line every two and a half metres, drawn in
 * its own shader so the lines stay crisp near by and give way before they turn to noise far
 * off. The scene's fog is the horizon colour, so the ground fades into the same haze the sky
 * starts from, and the two meet without a seam: fog is mixed in after tone mapping and an sRGB
 * background is not tone-mapped, so a hex colour is that colour on both.
 *
 * Both are scenery: the ground's raycast is a no-op, so no click ever lands on it.
 */

import * as THREE from 'three';

/** Rows in the sky's gradient: the horizon is the middle row, straight up the last. */
const SKY_ROWS = 256;

/**
 * How far up the sky the colour changes: at the horizon it is the haze, from about this far
 * up (as a fraction of the way to the zenith, 0.34 ≈ 30°) it is the colour overhead — so a
 * camera looking across the flat has the blue at the top of its frame.
 */
const SKY_BLEND_TO = 0.34;

/** Metres a side: far past anything the camera (200 m far plane) can see. */
export const GROUND_SIZE_M = 800;
/** Below the rooms' floors (at 0), so they always win; walls stand on it. */
const GROUND_Y = -0.01;
const GROUND_COLOR = '#EDEFF2';
const GRID_MINOR_M = 0.5;
const GRID_MAJOR_M = 2.5;
const GRID_MINOR_COLOR = '#D5DAE0';
const GRID_MAJOR_COLOR = '#BCC3CC';

/** Where the fog starts and where the ground has gone entirely into the haze, in metres from the camera. */
export const FOG_NEAR_M = 60;
export const FOG_FAR_M = 190;

/** Hex → sRGB bytes. */
function bytes(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The sky as an equirectangular texture for `scene.background`: `horizon` at the horizon and
 * everywhere below it (the ground covers that half, and where the ground ends the haze goes
 * on), easing to `top` overhead. One pixel wide — the sky is the same all the way round.
 */
export function skyTexture(top: string, horizon: string): THREE.DataTexture {
  const data = new Uint8Array(SKY_ROWS * 4);
  const high = bytes(top);
  const low = bytes(horizon);
  for (let row = 0; row < SKY_ROWS; row++) {
    // v runs from straight down (0) through the horizon (0.5) to straight up (1).
    const v = (row + 0.5) / SKY_ROWS;
    const up = Math.max(0, (v - 0.5) * 2);
    const x = Math.min(1, up / SKY_BLEND_TO);
    const t = x * x * (3 - 2 * x);
    for (let c = 0; c < 3; c++) data[row * 4 + c] = Math.round(low[c] + (high[c] - low[c]) * t);
    data[row * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 1, SKY_ROWS, THREE.RGBAFormat);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The ground: one lit plane with the grid ruled on it in world coordinates, so it lines up
 * with the plan wherever the plane is put. Centre it under the flat (`position.x/z`).
 */
export function buildGround(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 1,
    metalness: 0,
    // Behind the rooms' floors in depth as well as a centimetre below them: from far away a
    // centimetre is less than the depth buffer can tell apart.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 4,
  });
  const minor = new THREE.Color(GRID_MINOR_COLOR);
  const major = new THREE.Color(GRID_MAJOR_COLOR);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundMinor = { value: minor };
    shader.uniforms.groundMajor = { value: major };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vGroundWorld;
uniform vec3 groundMinor;
uniform vec3 groundMajor;
// One line every size metres, about widthPx pixels wide whatever the distance; cells that
// come down to a few pixels read as noise rather than a grid, so they fade out first.
float groundLine(vec2 p, float size, float widthPx) {
  vec2 r = p / size;
  vec2 w = max(fwidth(r), vec2(1e-5));
  vec2 g = abs(fract(r - 0.5) - 0.5) / w;
  float line = 1.0 - min(min(g.x, g.y) / widthPx, 1.0);
  return line * (1.0 - smoothstep(0.08, 0.3, max(w.x, w.y)));
}`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, groundMinor, 0.9 * groundLine(vGroundWorld.xz, ${GRID_MINOR_M.toFixed(2)}, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, groundMajor, groundLine(vGroundWorld.xz, ${GRID_MAJOR_M.toFixed(2)}, 1.4));`
      );
  };
  // One program for every ground, and not the plain standard material's.
  material.customProgramCacheKey = () => 'ground-grid-1';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ground';
  mesh.position.y = GROUND_Y;
  mesh.receiveShadow = true;
  // Scenery: a click on the ground is a click on nothing.
  mesh.raycast = () => {};
  return mesh;
}
