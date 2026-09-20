/**
 * Product photos rendered from the models themselves.
 *
 *   pnpm models:photos                    → every fixture, door and window in
 *                                           public/models/fixtures/manifest.json, and every
 *                                           radiator in public/models/radiators/manifest.json
 *   pnpm models:photos --only=door-oak,radiator-panel   → a few
 *
 * The sources' own thumbnails come on coloured gradients that look nothing like a product
 * photo, so each model is rendered here the way the studio shows it — its own materials, a
 * soft three-point light, a slight three-quarter view from the room side — onto a
 * transparent PNG (`public/uploads/furniture/fixture-<slug>.png`), and the manifest's
 * `imageUrl` is pointed at it so `pnpm models:seed` picks it up. Rendering runs in
 * Playwright's Chromium (the e2e suite's), with three.js served from node_modules.
 *
 * A radiator's file is ONE section, which nobody would recognise, so its photo is the
 * section repeated eight times at its pitch — a radiator — written to
 * `public/uploads/furniture/radiator-<name>.png`, the path `pnpm models:radiators` has
 * already put in that manifest.
 */

import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import type { FixtureManifestModel } from './fixture-models';
import type { RadiatorManifestModel } from './radiator-models';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'public', 'models', 'fixtures', 'manifest.json');
const RADIATOR_MANIFEST = path.join(ROOT, 'public', 'models', 'radiators', 'manifest.json');
const PHOTO_DIR = path.join(ROOT, 'public', 'uploads', 'furniture');
const SIZE = 720;
/** A radiator is photographed as this many of its sections side by side. */
const RADIATOR_SECTIONS = 8;

const MIME: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };

/** The page: three.js from node_modules, one model at a time, a promise per render. */
const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const size = ${SIZE};
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(size, size);
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

window.renderModel = async (url, mount, row) => {
  const scene = new THREE.Scene();
  const gltf = await loader.loadAsync(url);
  let model = gltf.scene;
  model.traverse((child) => {
    if (child.isMesh) {
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  // A radiator: the one section in the file, repeated at its pitch and centred.
  if (row) {
    const sections = new THREE.Group();
    for (let k = 0; k < row.count; k++) {
      const section = k === 0 ? model : model.clone(true);
      section.position.x = (k - (row.count - 1) / 2) * row.pitch;
      sections.add(section);
    }
    model = sections;
  }
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  const extent = box.getSize(new THREE.Vector3());
  const radius = Math.max(extent.length() / 2, 0.01);

  // Soft studio light: a warm key from the front-left-above, a cool fill from the right, a
  // rim from behind, and a sky. A wall fixture is lit as if on its wall; a ceiling fitting
  // as if hanging in a room.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c5, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(centre.x - radius * 1.6, centre.y + radius * 2.2, centre.z + radius * 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  const cam = key.shadow.camera; cam.left = cam.bottom = -radius * 2; cam.right = cam.top = radius * 2; cam.near = 0.01; cam.far = radius * 10;
  key.target.position.copy(centre);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.9);
  fill.position.set(centre.x + radius * 2.4, centre.y + radius * 0.6, centre.z + radius * 1.8);
  fill.target.position.copy(centre);
  scene.add(fill, fill.target);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(centre.x + radius * 0.5, centre.y + radius * 2.5, centre.z - radius * 2.5);
  rim.target.position.copy(centre);
  scene.add(rim, rim.target);
  // The lamps: a warm glow from the bulb itself, so a shade reads as lit.
  if (mount === 'ceiling' || mount === 'wall') {
    const glow = new THREE.PointLight(0xffd9a0, 0.6, radius * 6, 1.5);
    glow.position.set(centre.x, centre.y, centre.z + (mount === 'wall' ? radius * 0.4 : 0));
    scene.add(glow);
  }
  // A ground shadow under a door or a radiator, so it stands rather than floats.
  if (mount === 'door' || mount === 'radiator') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 8, radius * 8), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = box.min.y;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, radius * 40);
  // Three-quarter view from the room side (+z), a little above; a ceiling fitting is seen
  // from slightly below, the way one sees a lamp; a radiator from further round and higher,
  // so its end and its top — what tells one kind from another — are in the picture.
  const dir = mount === 'ceiling' ? new THREE.Vector3(0.75, -0.22, 1) : mount === 'door' || mount === 'window' ? new THREE.Vector3(0.55, 0.28, 1) : mount === 'radiator' ? new THREE.Vector3(0.78, 0.42, 1) : new THREE.Vector3(0.6, 0.35, 1);
  dir.normalize();
  const fit = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.06;
  camera.position.copy(centre).addScaledVector(dir, fit);
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL('image/png');
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose?.(); } });
  return data;
};
window.ready = true;
</script>`;

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const wanted = <T extends { slug: string }>(list: T[]): T[] => (only ? list.filter((m) => only.includes(m.slug)) : list);
  const manifest = existsSync(MANIFEST) ? (JSON.parse(await readFile(MANIFEST, 'utf8')) as { models: FixtureManifestModel[]; [k: string]: unknown }) : null;
  const models = wanted(manifest?.models ?? []);
  // The radiators' manifest already names each photo (`pnpm models:radiators` writes the path), so it is only read.
  const radiators = existsSync(RADIATOR_MANIFEST) ? wanted((JSON.parse(await readFile(RADIATOR_MANIFEST, 'utf8')) as { models: RadiatorManifestModel[] }).models) : [];
  if (models.length + radiators.length === 0) throw new Error(only ? `nothing matches --only=${only.join(',')}` : 'no manifest — run `pnpm models:fixtures` and `pnpm models:radiators` first');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => console.error('  page error:', error.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, { timeout: 30_000 });

    type Row = { count: number; pitch: number } | null;
    // The page's own origin serves the project root, so a public URL lives under /public.
    const render = async (url: string, mount: string, row: Row): Promise<Buffer> => {
      const data = await page.evaluate(([u, m, r]) => (window as unknown as { renderModel: (u: string, m: string, r: Row) => Promise<string> }).renderModel(u, m, r), [`/public${url}`, mount, row] as const);
      return Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    };

    let done = 0;
    for (const model of models) {
      process.stdout.write(`• ${model.slug} `);
      try {
        const png = await render(model.url, model.mount, null);
        const file = path.join(PHOTO_DIR, `fixture-${model.slug}.png`);
        await writeFile(file, png);
        // The source's thumbnail, if one was fetched, is superseded.
        await rm(path.join(PHOTO_DIR, `fixture-${model.slug}.jpg`), { force: true });
        model.imageUrl = `/uploads/furniture/fixture-${model.slug}.png`;
        done++;
        console.log(`✓ ${(png.length / 1024).toFixed(0)} KB`);
      } catch (error) {
        console.log(`✗ ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
    if (manifest && models.length) await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

    for (const model of radiators) {
      process.stdout.write(`• ${model.slug} ×${RADIATOR_SECTIONS} `);
      try {
        const png = await render(model.url, 'radiator', { count: RADIATOR_SECTIONS, pitch: model.sectionWidthCm / 100 });
        await writeFile(path.join(ROOT, 'public', model.imageUrl), png);
        done++;
        console.log(`✓ ${(png.length / 1024).toFixed(0)} KB`);
      } catch (error) {
        console.log(`✗ ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
    console.log(`\n${done} of ${models.length + radiators.length} rendered · ${path.relative(ROOT, PHOTO_DIR)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
