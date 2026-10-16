/**
 * The custom wall decor in 3D: each piece of `scene.decor` drawn from the same fit the budget
 * measures (`lib/design/decor/layout`), in the materials chosen for its slots.
 *
 * Plain three.js, no React (the viewer composes it). Notes on choices that matter:
 *
 * - **Its own materials.** Decor materials are cached here, not in `StyleMaterials`: that class
 *   lets go of every surface the room shells do not wear (`releaseUnused`), which would dispose
 *   the decor's under it; and a tinted fabric or lacquer has to multiply its colour over its
 *   texture, which a finish deliberately does not. `releaseDecorMaterials` frees them when the
 *   viewer unmounts.
 * - **Light without lights.** An LED line is an emissive strip and a soft glow card on the
 *   surface it washes (additive, depth-writing nothing) — no `RectAreaLight`, no point light:
 *   every light is paid on every lit pixel (3d-engine.md, gotcha 22), and a flat of coves and
 *   halos would have cost more than its furniture.
 * - **UVs in metres** (gotcha 11): a texture's `textureScaleM` is one tile, whatever the size.
 * - Every mesh is tagged `pickKind: 'decor'` with its piece's id, and each piece on a wall
 *   carries `wallCut` (`kind: 'decor'`), so the cutaway takes it away with its wall.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { decorWall, fitField, fitLight, fitMoulding, fitNiche, fitSlats, paramsOf, type DecorWall, type Rect } from '@/lib/design/decor/layout';
import { hasLed } from '@/lib/design/decor/families';
import { ledColor } from '@/lib/design/decor/materials';
import type { DecorMaterial, DecorPiece, FloorPlan, PlanRoom } from '@/lib/design/types';
import { loadStarted } from './loadProgress';
import type { WallCut } from './buildScene';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const textureCache = new Map<string, THREE.Texture>();
const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();

function texture(url: string, scale: number, srgb: boolean, onReady: (t: THREE.Texture) => void): void {
  const key = `${url}|${scale}|${srgb}`;
  const cached = textureCache.get(key);
  if (cached) {
    if (cached.image) onReady(cached);
    else cached.userData.waiting.push(onReady);
    return;
  }
  if (!loader) return;
  const done = loadStarted();
  const waiting: Array<(t: THREE.Texture) => void> = [onReady];
  const t = loader.load(
    url,
    (loaded) => {
      for (const fn of waiting) fn(loaded);
      waiting.length = 0;
      done();
    },
    undefined,
    () => done()
  );
  t.userData.waiting = waiting;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / scale, 1 / scale);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, t);
}

/**
 * What a slot is drawn in: its material's texture (tiled at its scale) with the chosen colour
 * multiplied over it, or its colour alone. `fallback` is the colour a slot with nothing chosen
 * stands in.
 */
export function decorMaterial(material: DecorMaterial | undefined, fallback: string, roughness = 0.75): THREE.MeshStandardMaterial {
  const product = material?.product ?? null;
  const textureUrl = product?.textureUrl ?? null;
  const tint = material?.colorHex ?? null;
  const base = tint ?? (textureUrl ? '#FFFFFF' : product?.colorHex ?? fallback);
  const specs = material?.specs ?? {};
  const scale = specs.textureScaleM ?? 1;
  const rough = specs.roughness ?? roughness;
  const key = `${textureUrl}|${base}|${scale}|${rough}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(base), roughness: rough, metalness: product?.categorySlug === 'decor-trim' && !textureUrl ? 0.6 : 0 });
  if (textureUrl) texture(textureUrl, scale, true, (t) => {
    m.map = t;
    m.needsUpdate = true;
  });
  materialCache.set(key, m);
  return m;
}

const plain = (color: string, roughness = 0.9) => decorMaterial(undefined, color, roughness);

function ledMaterial(material: DecorMaterial | undefined): THREE.MeshStandardMaterial {
  const color = ledColor(material?.specs?.cct);
  const key = `led|${color}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: 2.4 });
  materialCache.set(key, m);
  return m;
}

/** A glow card's soft gradient: bright along one edge, gone at the other. */
let glowTexture: THREE.Texture | null = null;
function glowMap(): THREE.Texture | null {
  if (glowTexture || typeof document === 'undefined') return glowTexture;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function glowMaterial(material: DecorMaterial | undefined, strength = 0.55): THREE.MeshBasicMaterial {
  const color = ledColor(material?.specs?.cct);
  const key = `glow|${color}|${strength}`;
  const cached = materialCache.get(key) as unknown as THREE.MeshBasicMaterial | undefined;
  if (cached) return cached;
  const m = new THREE.MeshBasicMaterial({ color, map: glowMap(), transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  materialCache.set(key, m as unknown as THREE.MeshStandardMaterial);
  return m;
}

/** Frees every decor material and texture — when the viewer unmounts (its GPU copies only). */
export function releaseDecorMaterials(): void {
  for (const m of materialCache.values()) m.dispose();
  for (const t of textureCache.values()) t.dispose();
  materialCache.clear();
  textureCache.clear();
}

// ---------------------------------------------------------------------------
// Geometry helpers (wall frame: x along, y up, z into the room)
// ---------------------------------------------------------------------------

/** A box whose UVs are metres on every face. */
function metreBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
  return g;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.ownsGeometry = true;
  return m;
}

/** A glow card flat on the wall (facing into the room), bright edge at `y`, fading `reach` metres up (`up`) or down. */
function wallGlow(x0: number, x1: number, y: number, reach: number, up: boolean, z: number, material: DecorMaterial | undefined, strength?: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(x1 - x0, reach);
  const m = new THREE.Mesh(geometry, glowMaterial(material, strength));
  m.position.set((x0 + x1) / 2, up ? y + reach / 2 : y - reach / 2, z);
  // The gradient's bright end is the texture's top; turned over for a glow that rises.
  if (up) m.rotation.z = Math.PI;
  m.renderOrder = 3;
  m.userData.ownsGeometry = true;
  return m;
}

function ledStrip(length: number, material: DecorMaterial | undefined): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(length, 0.01, 0.01), ledMaterial(material));
  m.castShadow = false;
  return m;
}

/** Wall-frame content into the world, on its edge. */
function onEdge(edge: PlanEdge, content: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.position.set(edge.a.x, 0, edge.a.z);
  g.rotation.y = Math.atan2(edge.inward.x, edge.inward.z);
  g.add(content);
  return g;
}

function cutFor(edge: PlanEdge): WallCut {
  return { kind: 'decor', outward: { x: -edge.inward.x, z: -edge.inward.z }, mid: { x: edge.a.x + edge.dir.x * edge.length / 2, z: edge.a.z + edge.dir.z * edge.length / 2 } };
}

/** The edge trim round a field's sides and top. */
function trims(wall: DecorWall, depth: number, material: DecorMaterial | undefined): THREE.Object3D[] {
  if (!material?.product) return [];
  const t = 0.012;
  const m = decorMaterial(material, '#222222', 0.4);
  return [
    mesh(metreBox(t, wall.height, depth + 0.004), m, wall.x0 - t / 2, wall.y0 + wall.height / 2, depth / 2),
    mesh(metreBox(t, wall.height, depth + 0.004), m, wall.x1 + t / 2, wall.y0 + wall.height / 2, depth / 2),
    mesh(metreBox(wall.width + 2 * t, t, depth + 0.004), m, wall.x0 + wall.width / 2, wall.y1 + t / 2, depth / 2),
  ];
}

// ---------------------------------------------------------------------------
// The families
// ---------------------------------------------------------------------------

function buildSlats(piece: DecorPiece, wall: DecorWall): THREE.Group {
  const g = new THREE.Group();
  const params = paramsOf(piece);
  const fit = fitSlats(params, wall);
  const z = fit.standoff + fit.backing + fit.depth / 2;
  const parts: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const x of fit.xs) {
    const geo = metreBox(fit.slatWidth, wall.height, fit.depth);
    // Each slat's grain starts somewhere else, so no two read as the same board.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const du = rand() * 3;
    const dv = rand() * 3;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) + du, uv.getY(k) + dv);
    geo.translate(x, wall.y0 + wall.height / 2, z);
    parts.push(geo);
  }
  if (parts.length) {
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    g.add(mesh(merged, decorMaterial(piece.materials.face, '#C9A177', 0.62)));
  }
  if (fit.backing > 0) g.add(mesh(metreBox(wall.width, wall.height, fit.backing), decorMaterial(piece.materials.backing, '#2B2B2C', 0.95), wall.x0 + wall.width / 2, wall.y0 + wall.height / 2, fit.standoff + fit.backing / 2));
  if (hasLed(piece.family, params)) {
    const led = piece.materials.led;
    const front = z + fit.depth / 2;
    if (params.led === 'bottom' || params.led === 'halo') {
      const strip = ledStrip(wall.width * 0.97, led);
      strip.position.set(wall.x0 + wall.width / 2, wall.y0 - 0.006, front - 0.01);
      g.add(strip, wallGlow(wall.x0, wall.x1, wall.y0, Math.min(0.9, wall.y0), false, 0.004, led));
    }
    if (params.led === 'top' || params.led === 'halo') {
      const strip = ledStrip(wall.width * 0.97, led);
      strip.position.set(wall.x0 + wall.width / 2, wall.y1 + 0.006, front - 0.01);
      g.add(strip, wallGlow(wall.x0, wall.x1, wall.y1, Math.min(0.9, wall.roomHeight - wall.y1), true, 0.004, led));
    }
  }
  return g;
}

function frameGeometry(r: Rect, profile: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(r.w, 0);
  s.lineTo(r.w, r.h);
  s.lineTo(0, r.h);
  s.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.moveTo(profile, profile);
  hole.lineTo(profile, r.h - profile);
  hole.lineTo(r.w - profile, r.h - profile);
  hole.lineTo(r.w - profile, profile);
  hole.lineTo(profile, profile);
  s.holes.push(hole);
  const bevel = Math.min(0.008, profile * 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
  g.translate(r.x, r.y, bevel);
  return g;
}

function buildMoulding(piece: DecorPiece, wall: DecorWall, room: PlanRoom): THREE.Group {
  const g = new THREE.Group();
  const fit = fitMoulding(paramsOf(piece), wall, room.openings, piece.materials.profile?.specs?.profileMm);
  const material = decorMaterial(piece.materials.profile, '#F4EFE6', 0.55);
  const parts = fit.frames.map((r) => frameGeometry(r, fit.profile));
  for (const rail of fit.rails) {
    const geo = metreBox(rail.x1 - rail.x0, 0.045, 0.022);
    geo.translate((rail.x0 + rail.x1) / 2, rail.y, 0.011);
    parts.push(geo);
  }
  if (parts.length) {
    const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    for (const p of parts) p.dispose();
    const m = mesh(merged, material);
    m.castShadow = false;
    g.add(m);
  }
  return g;
}

function archPath(cx: number, y0: number, w: number, h: number, arch: boolean): THREE.Path {
  const p = new THREE.Path();
  const r = w / 2;
  p.moveTo(cx - r, y0);
  if (arch) {
    p.lineTo(cx - r, y0 + h - r);
    p.absarc(cx, y0 + h - r, r, Math.PI, 0, true);
  } else {
    p.lineTo(cx - r, y0 + h);
    p.lineTo(cx + r, y0 + h);
  }
  p.lineTo(cx + r, y0);
  p.lineTo(cx - r, y0);
  return p;
}

function buildNiche(piece: DecorPiece, wall: DecorWall): THREE.Group {
  const g = new THREE.Group();
  const params = paramsOf(piece);
  const fit = fitNiche(params, wall);
  const body = decorMaterial(piece.materials.body, '#F2EEE7', 0.9);
  const tint = piece.materials.body?.colorHex ?? piece.materials.body?.product?.colorHex ?? '#F2EEE7';
  const backColor = '#' + new THREE.Color(tint).multiplyScalar(0.86).getHexString();

  // The build-out: its outline with the firebox notched in (a hole touching the edge would not
  // triangulate), the niches as holes; extruded its depth into the room.
  const shape = new THREE.Shape();
  shape.moveTo(wall.x0, wall.y0);
  if (fit.mantel) {
    const { cx, fireW, fireH } = fit.mantel;
    shape.lineTo(cx - fireW / 2, wall.y0);
    shape.lineTo(cx - fireW / 2, wall.y0 + fireH);
    shape.lineTo(cx + fireW / 2, wall.y0 + fireH);
    shape.lineTo(cx + fireW / 2, wall.y0);
  }
  shape.lineTo(wall.x1, wall.y0);
  shape.lineTo(wall.x1, wall.y1);
  shape.lineTo(wall.x0, wall.y1);
  shape.lineTo(wall.x0, wall.y0);
  for (const n of fit.niches) shape.holes.push(archPath(n.cx, n.y0, n.w, n.h, n.arch));
  g.add(mesh(new THREE.ExtrudeGeometry(shape, { depth: fit.depth, bevelEnabled: false, curveSegments: 24 }), body));

  const back = plain(backColor, 0.95);
  const shelfMaterial = decorMaterial(piece.materials.shelf, '#C9A177', 0.6);
  const led = piece.materials.led;
  for (const n of fit.niches) {
    const outline = new THREE.Shape(archPath(n.cx, n.y0, n.w, n.h, n.arch).getPoints(24));
    g.add(mesh(new THREE.ShapeGeometry(outline, 24), back, 0, 0, 0.003));
    if (hasLed(piece.family, params) && params.led === 'inside') {
      const top = n.arch ? n.y0 + n.h - n.w / 2 : n.y0 + n.h - 0.02;
      const strip = ledStrip(Math.min(0.6, n.w * 0.6), led);
      strip.position.set(n.cx, top + (n.arch ? 0.15 : -0.01), 0.05);
      g.add(strip, wallGlow(n.cx - n.w / 2 + 0.02, n.cx + n.w / 2 - 0.02, top, Math.min(1.2, n.h * 0.6), false, 0.006, led, 0.4));
    }
  }
  if (piece.materials.shelf?.product) for (const sh of fit.shelves) g.add(mesh(metreBox(sh.w, 0.03, fit.depth - 0.02), shelfMaterial, sh.cx, sh.y, (fit.depth - 0.02) / 2));

  if (fit.mantel) {
    const { cx, w, h, fireW, fireH } = fit.mantel;
    const stone = decorMaterial(piece.materials.surround, '#E6E0DB', 0.25);
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(-fireW / 2, 0);
    s.lineTo(-fireW / 2, fireH);
    s.lineTo(fireW / 2, fireH);
    s.lineTo(fireW / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h);
    s.lineTo(-w / 2, h);
    s.lineTo(-w / 2, 0);
    g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }), stone, cx, wall.y0, fit.depth));
    g.add(mesh(metreBox(w + 0.2, 0.06, 0.24), stone, cx, wall.y0 + h + 0.03, fit.depth + 0.06));
    g.add(mesh(metreBox(w + 0.1, 0.03, 0.5), stone, cx, wall.y0 + 0.015, fit.depth + 0.25));
    g.add(mesh(metreBox(fireW, fireH, 0.02), plain('#1B1715', 0.95), cx, wall.y0 + fireH / 2, 0.05));
  }
  return g;
}

function buildField(piece: DecorPiece, wall: DecorWall): THREE.Group {
  const g = new THREE.Group();
  const params = paramsOf(piece);
  const fit = fitField(piece.family, params, wall);
  const face = decorMaterial(piece.materials.face, piece.family === 'slab' ? '#E6E0DB' : '#D8D2C8', piece.family === 'slab' ? 0.25 : 0.8);
  const z0 = fit.standoff;
  const faceTop = fit.border ? fit.border.y0 : wall.y1;
  const faceH = faceTop - wall.y0;

  if (fit.modules.length > 0) {
    // Upholstered channels or a fluted relief: rounded modules side by side.
    const depth = params.style === 'fluted' ? 0.025 : Math.max(0.03, fit.thickness);
    const parts = fit.modules.map((m) => {
      const geo = new RoundedBoxGeometry(m.w - (params.style === 'fluted' ? 0.002 : 0.004), faceH, depth, params.style === 'fluted' ? 2 : 4, Math.min(m.w / 2.2, depth / 2, 0.03));
      geo.translate(m.x, wall.y0 + faceH / 2, z0 + depth / 2);
      return geo;
    });
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    g.add(mesh(merged, face));
  } else {
    g.add(mesh(metreBox(wall.width, faceH, fit.thickness), face, wall.x0 + wall.width / 2, wall.y0 + faceH / 2, z0 + fit.thickness / 2));
  }
  if (fit.border) {
    const border = decorMaterial(piece.materials.border ?? piece.materials.face, '#B9A27E', 0.4);
    g.add(mesh(metreBox(wall.width, fit.border.y1 - fit.border.y0, fit.thickness + 0.004), border, wall.x0 + wall.width / 2, (fit.border.y0 + fit.border.y1) / 2, z0 + (fit.thickness + 0.004) / 2));
  }
  // Seams: a hairline of shadow where two slabs or panels meet.
  if (fit.seamsX.length || fit.seamsY.length) {
    const seam = plain('#3B3631', 0.9);
    const front = z0 + fit.thickness + 0.0008;
    for (const x of fit.seamsX) {
      const m = mesh(new THREE.PlaneGeometry(0.003, faceH), seam, x, wall.y0 + faceH / 2, front);
      m.castShadow = false;
      g.add(m);
    }
    for (const y of fit.seamsY) {
      const m = mesh(new THREE.PlaneGeometry(wall.width, 0.003), seam, wall.x0 + wall.width / 2, y, front);
      m.castShadow = false;
      g.add(m);
    }
  }
  const edges = trims(wall, z0 + fit.thickness, piece.materials.trim);
  // `add()` with nothing logs an error in three: only when there is a trim.
  if (edges.length) g.add(...edges);
  if (hasLed(piece.family, params)) {
    const led = piece.materials.led;
    if (params.led === 'halo' && z0 > 0.01) {
      // A halo: the light behind a stood-off slab washes the wall round its edge.
      const pad = 0.35;
      g.add(
        wallGlow(wall.x0, wall.x1, wall.y1, pad, true, 0.003, led, 0.45),
        wallGlow(wall.x0, wall.x1, wall.y0, Math.min(pad, wall.y0), false, 0.003, led, 0.45)
      );
      for (const x of [wall.x0, wall.x1]) {
        const side = wallGlow(wall.y0, wall.y1, 0, pad, x === wall.x1, 0.003, led, 0.45);
        side.rotation.z = x === wall.x1 ? Math.PI / 2 : -Math.PI / 2;
        side.position.set(x === wall.x1 ? x + pad / 2 : x - pad / 2, (wall.y0 + wall.y1) / 2, 0.003);
        g.add(side);
      }
    } else if (params.led === 'bottom' || params.led === 'halo') {
      const strip = ledStrip(wall.width * 0.97, led);
      strip.position.set(wall.x0 + wall.width / 2, wall.y0 - 0.006, z0 + fit.thickness - 0.01);
      g.add(strip, wallGlow(wall.x0, wall.x1, wall.y0, Math.min(0.8, wall.y0), false, 0.004, led));
    } else if (params.led === 'top') {
      const strip = ledStrip(wall.width * 0.97, led);
      strip.position.set(wall.x0 + wall.width / 2, wall.y1 + 0.006, z0 + fit.thickness - 0.01);
      g.add(strip, wallGlow(wall.x0, wall.x1, wall.y1, Math.min(0.8, wall.roomHeight - wall.y1), true, 0.004, led));
    }
  }
  return g;
}

/** A cove: the lowered panel (its underside and edges — seen from above the room stays open, as with the ceiling), the light round its top, the wash on the walls. */
function buildCove(piece: DecorPiece, room: PlanRoom): THREE.Group {
  const g = new THREE.Group();
  const params = paramsOf(piece);
  const fit = fitLight(piece, room, params);
  const led = piece.materials.led;
  if (fit.panel) {
    const { minX, maxX, minZ, maxZ, y } = fit.panel;
    const body = decorMaterial(piece.materials.body, '#FAF8F4', 0.95);
    const t = 0.07;
    const under = mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), body, (minX + maxX) / 2, y - t, (minZ + maxZ) / 2);
    under.rotation.x = Math.PI / 2;
    under.castShadow = false;
    g.add(under);
    for (const run of fit.runs) {
      const len = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z);
      const mid = { x: (run.a.x + run.b.x) / 2, z: (run.a.z + run.b.z) / 2 };
      const yaw = Math.atan2(run.outward.x, run.outward.z);
      const edge = mesh(new THREE.PlaneGeometry(len, t), body, mid.x, y - t / 2, mid.z);
      edge.rotation.y = yaw;
      edge.castShadow = false;
      g.add(edge);
      const strip = ledStrip(len * 0.98, led);
      strip.position.set(mid.x - run.outward.x * 0.03, y + 0.01, mid.z - run.outward.z * 0.03);
      strip.rotation.y = yaw;
      g.add(strip);
    }
  }
  // The wash on each wall above the panel, taken away with its wall in the cutaway.
  for (const edge of roomEdges(room.polygon)) {
    const wash = wallGlow(0, edge.length, room.heightM, 0.75, false, 0.004, led, 0.5);
    const holder = onEdge(edge, wash);
    holder.userData.wallCut = cutFor(edge);
    g.add(holder);
  }
  return g;
}

function buildLine(piece: DecorPiece, room: PlanRoom): THREE.Object3D | null {
  const wall = decorWall(piece, room);
  if (!wall) return null;
  const led = piece.materials.led;
  const g = new THREE.Group();
  const strip = ledStrip(wall.width, led);
  strip.position.set(wall.x0 + wall.width / 2, wall.y0, 0.01);
  g.add(strip, wallGlow(wall.x0, wall.x1, wall.y0, 0.5, false, 0.004, led), wallGlow(wall.x0, wall.x1, wall.y0, 0.5, true, 0.004, led));
  const holder = onEdge(wall.edge, g);
  holder.userData.wallCut = cutFor(wall.edge);
  return holder;
}

/** One piece in the world, or null when it cannot be built on its room as the room is now. */
export function buildDecorPiece(piece: DecorPiece, room: PlanRoom): THREE.Object3D | null {
  let built: THREE.Object3D | null = null;
  if (piece.family === 'light') {
    built = paramsOf(piece).path === 'line' ? buildLine(piece, room) : buildCove(piece, room);
  } else {
    const wall = decorWall(piece, room);
    if (!wall) return null;
    const content =
      piece.family === 'slats' ? buildSlats(piece, wall) : piece.family === 'moulding' ? buildMoulding(piece, wall, room) : piece.family === 'niche' ? buildNiche(piece, wall) : buildField(piece, wall);
    built = onEdge(wall.edge, content);
    built.userData.wallCut = cutFor(wall.edge);
  }
  if (!built) return null;
  built.name = `decor-${piece.id}`;
  built.traverse((child) => {
    child.userData = { ...child.userData, pickKind: 'decor', decorId: piece.id, roomId: piece.roomId };
  });
  return built;
}

/** The whole flat's decor (or the rooms in view). Disposed with `disposeOwnedGeometry` like the shells. */
export function buildDecor(plan: FloorPlan, decor: DecorPiece[] | undefined, rooms: Set<string> | null): THREE.Group {
  const root = new THREE.Group();
  root.name = 'decor';
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  for (const piece of decor ?? []) {
    if (rooms && !rooms.has(piece.roomId)) continue;
    const room = byId.get(piece.roomId);
    if (!room) continue;
    const built = buildDecorPiece(piece, room);
    if (built) root.add(built);
  }
  return root;
}
