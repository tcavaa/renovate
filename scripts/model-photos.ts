/**
 * Product photos rendered from the models themselves.
 *
 *   pnpm models:photos                    → every fixture, door and window in
 *                                           public/models/fixtures/manifest.json, every
 *                                           radiator in public/models/radiators/manifest.json
 *                                           every model in public/models/equipment/manifest.json
 *                                           and every run in public/models/kitchens/manifest.json
 *   pnpm models:photos --only=door-oak,radiator-panel   → a few (slugs from any of the four)
 *
 * The sources' own thumbnails come on coloured gradients that look nothing like a product
 * photo, so each model is rendered here the way the studio shows it — its own materials, a
 * soft three-point light, a slight three-quarter view from the room side — onto a
 * transparent WebP (`public/uploads/furniture/fixture-<slug>.webp`), and the manifest's
 * `imageUrl` is pointed at it so `pnpm models:seed` picks it up. Rendering runs in
 * Playwright's Chromium (the e2e suite's), with three.js served from node_modules.
 *
 * A radiator's file is ONE section, which nobody would recognise, so its photo is the
 * section repeated eight times at its pitch — a radiator — written to
 * `public/uploads/furniture/radiator-<name>.webp`, the path `pnpm models:radiators` has
 * already put in that manifest.
 *
 * The equipment (`pnpm models:equipment`) is photographed the same way, from a view that
 * suits its frame — a wall piece from the front and a little to the side, an air conditioner
 * from just below (its outlet is what tells it apart), a floor drain from above — with no
 * lamp glow, to the `imageUrl` its manifest already names
 * (`public/uploads/furniture/equipment-<slug>.webp`). A kitchen run (`pnpm models:kitchens`) is
 * photographed standing on its shadow, from the front and a little to the side, to
 * `public/uploads/furniture/kitchen-<slug>.webp`.
 */

import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import type { EquipmentManifestModel } from './equipment-models';
import type { FixtureManifestModel } from './fixture-models';
import type { KitchenManifestModel } from './kitchen-models';
import type { RadiatorManifestModel } from './radiator-models';
import { writePhotoWebp } from './lib/photos';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'public', 'models', 'fixtures', 'manifest.json');
const RADIATOR_MANIFEST = path.join(ROOT, 'public', 'models', 'radiators', 'manifest.json');
const EQUIPMENT_MANIFEST = path.join(ROOT, 'public', 'models', 'equipment', 'manifest.json');
const KITCHEN_MANIFEST = path.join(ROOT, 'public', 'models', 'kitchens', 'manifest.json');
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
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
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
// The larger models' geometry is Draco (pnpm models:compress); three's decoder, from node_modules too.
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/').setDecoderConfig({ type: 'wasm' }));

window.renderModel = async (url, mount, row, view) => {
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
  // Broad smooth faces seen at a slant (a hood's canopy, an air conditioner's front) shadow
  // themselves in rings without a bias.
  if (mount.startsWith('equipment') || mount === 'kitchen') { key.shadow.bias = -0.0003; key.shadow.normalBias = radius * 0.004; }
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
  // A ground shadow under a door, a radiator or a kitchen run, so it stands rather than floats.
  if (mount === 'door' || mount === 'radiator' || mount === 'kitchen') {
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
  // An equipment photo names its own view (see EQUIPMENT_VIEW).
  const dir = view ? new THREE.Vector3(view[0], view[1], view[2]) : mount === 'ceiling' ? new THREE.Vector3(0.75, -0.22, 1) : mount === 'door' || mount === 'window' ? new THREE.Vector3(0.55, 0.28, 1) : mount === 'radiator' ? new THREE.Vector3(0.78, 0.42, 1) : new THREE.Vector3(0.6, 0.35, 1);
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
  // The radiators' and the equipment's manifests already name each photo (their scripts write the path), so they are only read.
  const radiators = existsSync(RADIATOR_MANIFEST) ? wanted((JSON.parse(await readFile(RADIATOR_MANIFEST, 'utf8')) as { models: RadiatorManifestModel[] }).models) : [];
  const equipment = existsSync(EQUIPMENT_MANIFEST) ? wanted((JSON.parse(await readFile(EQUIPMENT_MANIFEST, 'utf8')) as { models: EquipmentManifestModel[] }).models) : [];
  const kitchens = existsSync(KITCHEN_MANIFEST) ? wanted((JSON.parse(await readFile(KITCHEN_MANIFEST, 'utf8')) as { models: KitchenManifestModel[] }).models) : [];
  if (models.length + radiators.length + equipment.length + kitchens.length === 0) throw new Error(only ? `nothing matches --only=${only.join(',')}` : 'no manifest — run `pnpm models:fixtures`, `pnpm models:radiators`, `pnpm models:equipment` and `pnpm models:kitchens` first');

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
    type View = [number, number, number] | null;
    // The page's own origin serves the project root, so a public URL lives under /public.
    const render = async (url: string, mount: string, row: Row, view: View = null): Promise<Buffer> => {
      const data = await page.evaluate(([u, m, r, v]) => (window as unknown as { renderModel: (u: string, m: string, r: Row, v: View) => Promise<string> }).renderModel(u, m, r, v), [`/public${url}`, mount, row, view] as const);
      return Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    };

    let done = 0;
    for (const model of models) {
      process.stdout.write(`• ${model.slug} `);
      try {
        const png = await render(model.url, model.mount, null);
        // WebP with its transparency; the source's thumbnail, if one was fetched, is superseded.
        const file = await writePhotoWebp(png, path.join(PHOTO_DIR, `fixture-${model.slug}.webp`));
        model.imageUrl = `/uploads/furniture/fixture-${model.slug}.webp`;
        done++;
        console.log(`✓ ${((await stat(file)).size / 1024).toFixed(0)} KB`);
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
        // Written as WebP whatever the manifest's extension (the pipelines name `.webp`).
        const file = await writePhotoWebp(png, path.join(ROOT, 'public', model.imageUrl));
        done++;
        console.log(`✓ ${((await stat(file)).size / 1024).toFixed(0)} KB`);
      } catch (error) {
        console.log(`✗ ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
    for (const model of equipment) {
      process.stdout.write(`• ${model.slug} `);
      try {
        const png = await render(model.url, `equipment-${model.frame}`, null, equipmentView(model));
        // Written as WebP whatever the manifest's extension (the pipelines name `.webp`).
        const file = await writePhotoWebp(png, path.join(ROOT, 'public', model.imageUrl));
        done++;
        console.log(`✓ ${((await stat(file)).size / 1024).toFixed(0)} KB`);
      } catch (error) {
        console.log(`✗ ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
    for (const model of kitchens) {
      process.stdout.write(`• ${model.slug} `);
      try {
        const png = await render(model.url, 'kitchen', null, [0.5, 0.3, 1]);
        // Written as WebP whatever the manifest's extension (the pipelines name `.webp`).
        const file = await writePhotoWebp(png, path.join(ROOT, 'public', model.imageUrl));
        done++;
        console.log(`✓ ${((await stat(file)).size / 1024).toFixed(0)} KB`);
      } catch (error) {
        console.log(`✗ ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
    console.log(`\n${done} of ${models.length + radiators.length + equipment.length + kitchens.length} rendered · ${path.relative(ROOT, PHOTO_DIR)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

/**
 * Where the camera stands for a piece of equipment, as a direction from its middle (+z is the
 * room): a floor drain from above, an air conditioner hung high from just below, a cooker
 * hood about level, anything else on a wall from the front and a little above.
 */
function equipmentView(model: Pick<EquipmentManifestModel, 'frame' | 'kind'>): [number, number, number] {
  if (model.frame === 'floor') return [0.35, 1.1, 0.75];
  if (model.kind === 'ac_unit') return [0.5, -0.06, 1];
  if (model.kind === 'cooker_hood') return [0.55, 0.12, 1];
  if (model.frame === 'fitting') return [0.6, 0.35, 1];
  return [0.55, 0.25, 1];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
