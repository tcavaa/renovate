/**
 * The 3D models of the electrical layer — sockets, switches, wall lamps, ceiling lamps — and
 * of the doors and windows, fetched from their sources, cleaned up and normalised for the
 * studio.
 *
 *   pnpm models:fixtures                 → public/models/fixtures/*.glb + manifest.json
 *                                          + lib/design3d/fixtureManifest.ts (the same data, typed)
 *   pnpm models:fixtures --only=switch   → redo one entry; merges into the manifest
 *   pnpm models:photos                   → then render the product photos (scripts/model-photos.ts)
 *
 * Sources (all free to use; the licence and author travel in the manifest):
 *
 *   - Poly Haven (CC0): photoscanned lamps with real PBR maps, in metres.
 *   - poly.pizza: Quaternius and Kenney (CC0) for the doors, windows and a few lamps, and
 *     community uploads and the Google Poly archive (CC-BY 3.0) for the sockets, switches
 *     and the rest. Sized here, because their files are in arbitrary units.
 *
 * Every output stands in its own frame, so the studio scales nothing it does not have to:
 *
 *   - a wall fixture is centred on x and y with its back on z = 0 and its front along +z
 *     (into the room, like `edge.facing` expects); a ceiling fixture is centred on x and z
 *     with its top at y = 0, hanging down;
 *   - a door or a window is centred on x (the opening's width), stands on y = 0 (the floor,
 *     or the sill) and is centred on z (the middle of the wall), its room side along +z.
 *     A door's leaf is its own node, named `leaf`, hung from the jamb at x min — the plan's
 *     `hinge: 'left'` — so the studio can swing it about that edge; the casing, when the
 *     model has one, is the node `frame`; a model that is one welded piece is `body` and
 *     is drawn closed. The studio scales the whole thing to the opening.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Document, NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import type { ElectricalKind, StyleId } from '../lib/design/types';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'fixtures');
const PHOTO_DIR = path.join(ROOT, 'public', 'uploads', 'furniture');
const TS_OUT = path.join(ROOT, 'lib', 'design3d', 'fixtureManifest.ts');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'renovate-fixtures');
const USER_AGENT = 'RenovationRoom-asset-fetch/1.0 (+https://remonti.ge)';
const TARGET_TRIANGLES = 6_000;
const MAX_BYTES = 900 * 1024;

type Mount = 'wall' | 'ceiling' | 'door' | 'window';

/** Which nodes of a door model are the leaf that swings. */
type LeafRule =
  /** Node names (the source keeps its parts apart). */
  | { nodes: RegExp }
  /** One welded piece: the triangles whose centre lies in this box (fractions of the model's width and height) are the leaf, the rest the frame. */
  | { box: { x: [number, number]; y: [number, number] } }
  /** The whole model is the leaf (no casing in the file; the studio draws its own). */
  | 'all'
  /** No leaf to swing: drawn closed. */
  | 'none';

interface FixtureEntry {
  slug: string;
  /** The electrical kinds drawn with this model (empty for doors and windows). */
  kinds: ElectricalKind[];
  mount: Mount;
  source:
    | { type: 'polyhaven'; id: string }
    | { type: 'polypizza'; id: string; url: string; title: string; author: string; license: string };
  /** Real size to scale to (uniform, by the largest of width and height); Poly Haven files are already in metres. */
  sizeCm?: { width: number; height: number };
  /** Turn about Y (degrees) after the automatic orientation, when the face comes out wrong. */
  yawDegrees?: number;
  /** Turn upside down (a bulb modelled standing that has to hang). */
  flipY?: boolean;
  /** Thin plates are turned so their thin axis is the depth; set when the file already faces +z. */
  keepAxes?: boolean;
  /** A Poly Haven file that is a small scene: keep only the nodes whose name matches (one tube of seven). */
  keepNodes?: RegExp;
  /** What the studio draws this for when nothing else is chosen: the door or window without a product, the casing around a bare leaf and an archway, the rose under a lamp that hangs from the catalogue. */
  role?: 'door' | 'window' | 'casing' | 'rose';
  /** Mirror across x after everything else — a door whose leaf hangs from the right jamb in the file. */
  mirror?: boolean;
  /** Doors: which part swings. */
  leaf?: LeafRule;
  /** Sold as this product in the catalogue (`pnpm models:seed` writes it); `styles` narrows which styles pick it first (all four otherwise). */
  product?: { kind: string; categorySlug: 'sockets-switches' | 'lighting' | 'doors' | 'windows'; priceGel: number; unit?: 'piece' | 'linear_m'; storeSlug: string; nameKa: string; nameEn: string; nameRu: string; styles?: StyleId[] };
}

const PP = 'https://static.poly.pizza';
const SOCKET_KINDS: ElectricalKind[] = ['socket', 'socket_double', 'socket_high', 'socket_kitchen', 'internet', 'tv'];
const FIXTURES: FixtureEntry[] = [
  // --- sockets and switches (8 × 8 cm plates) ---------------------------------------------
  {
    slug: 'socket-eu',
    kinds: SOCKET_KINDS,
    mount: 'wall',
    source: { type: 'polypizza', id: 'MCMUq7R1w5', url: `${PP}/b7766164-b6f8-471d-bfaa-bdc45dce1487.glb`, title: 'EU Outlet', author: 'J-Toastie', license: 'CC-BY 3.0' },
    sizeCm: { width: 8, height: 8 },
    product: { kind: 'socket', categorySlug: 'sockets-switches', priceGel: 18, storeSlug: 'lumina', nameKa: 'როზეტი „EU“ — თეთრი', nameEn: 'Socket "EU" — white', nameRu: 'Розетка «EU» — белая' },
  },
  {
    slug: 'socket-twin',
    kinds: SOCKET_KINDS,
    mount: 'wall',
    source: { type: 'polypizza', id: 'sw4oGFLDfC', url: `${PP}/b1cafb48-2d97-4823-bff2-c43f8a5b221a.glb`, title: 'Wall Socket', author: 'J-Toastie', license: 'CC-BY 3.0' },
    sizeCm: { width: 8, height: 8 },
    product: { kind: 'socket', categorySlug: 'sockets-switches', priceGel: 24, storeSlug: 'lumina', nameKa: 'როზეტი „Twin“ — ორბუდიანი, თეთრი', nameEn: 'Socket "Twin" — double, white', nameRu: 'Розетка «Twin» — двойная, белая' },
  },
  {
    slug: 'switch',
    kinds: ['switch'],
    mount: 'wall',
    source: { type: 'polypizza', id: '8sR1PkyAg-F', url: `${PP}/f502ad13-cde0-411b-8d8a-18fb4f58c0e6.glb`, title: 'Light switch', author: 'Poly by Google', license: 'CC-BY 3.0' },
    sizeCm: { width: 8, height: 8 },
    product: { kind: 'switch', categorySlug: 'sockets-switches', priceGel: 22, storeSlug: 'lumina', nameKa: 'ჩამრთველი — თეთრი', nameEn: 'Light switch — white', nameRu: 'Выключатель — белый' },
  },
  {
    slug: 'switch-classic',
    kinds: ['switch'],
    mount: 'wall',
    source: { type: 'polypizza', id: '59BtMbyUMe2', url: `${PP}/f6f92b54-1179-4ec7-aa94-f40964380f72.glb`, title: 'Light switch', author: 'jeremy', license: 'CC-BY 3.0' },
    sizeCm: { width: 8, height: 8 },
    product: { kind: 'switch', categorySlug: 'sockets-switches', priceGel: 26, storeSlug: 'lumina', nameKa: 'ჩამრთველი „Toggle“ — კრემისფერი', nameEn: 'Light switch "Toggle" — cream', nameRu: 'Выключатель «Toggle» — кремовый', styles: ['vintage', 'industrial'] },
  },

  // --- wall lamps -------------------------------------------------------------------------
  {
    slug: 'wall-lamp',
    kinds: ['light_wall'],
    mount: 'wall',
    source: { type: 'polyhaven', id: 'industrial_wall_lamp' },
    keepAxes: true,
    product: { kind: 'light_wall', categorySlug: 'lighting', priceGel: 140, storeSlug: 'lumina', nameKa: 'კედლის სანათი „Industrial“', nameEn: 'Wall lamp "Industrial"', nameRu: 'Бра «Industrial»', styles: ['industrial', 'vintage'] },
  },
  {
    slug: 'wall-sconce',
    kinds: ['light_wall'],
    mount: 'wall',
    source: { type: 'polyhaven', id: 'industrial_wall_sconce' },
    keepAxes: true,
    product: { kind: 'light_wall', categorySlug: 'lighting', priceGel: 165, storeSlug: 'lumina', nameKa: 'კედლის სანათი „Sconce“ — სპილენძი', nameEn: 'Wall sconce "Industrial" — copper', nameRu: 'Бра «Sconce» — медь', styles: ['vintage', 'industrial'] },
  },
  {
    slug: 'wall-lamp-brass',
    kinds: ['light_wall'],
    mount: 'wall',
    source: { type: 'polypizza', id: 'iLXKjr9t4A', url: `${PP}/a244bcc2-49bd-4f47-93cb-7a3337dc49a8.glb`, title: 'Sconce light', author: 'jrich01', license: 'CC-BY 3.0' },
    keepAxes: true,
    sizeCm: { width: 18, height: 40 },
    product: { kind: 'light_wall', categorySlug: 'lighting', priceGel: 95, storeSlug: 'lumina', nameKa: 'კედლის სანათი „Brass“ — ღია ნათურით', nameEn: 'Wall lamp "Brass" — open bulb', nameRu: 'Бра «Brass» — с открытой лампой', styles: ['vintage', 'scandinavian'] },
  },

  // --- ceiling lights ---------------------------------------------------------------------
  {
    slug: 'bulb',
    kinds: ['light_ceiling'],
    mount: 'ceiling',
    source: { type: 'polypizza', id: 'kDo0SbQW9Y', url: `${PP}/84c2d1c8-6931-4b5e-9440-fa9328ca23a9.glb`, title: 'Light bulb', author: 'reelpersen', license: 'CC0' },
    keepAxes: true,
    sizeCm: { width: 8, height: 40 },
    product: { kind: 'light_ceiling', categorySlug: 'lighting', priceGel: 35, storeSlug: 'lumina', nameKa: 'ჭერის სანათი — ნათურა კაბელზე', nameEn: 'Ceiling light — bulb on a cord', nameRu: 'Потолочный светильник — лампа на шнуре' },
  },
  {
    slug: 'ceiling-globe',
    kinds: ['light_ceiling'],
    mount: 'ceiling',
    source: { type: 'polyhaven', id: 'modern_ceiling_lamp_01' },
    keepAxes: true,
    product: { kind: 'light_ceiling', categorySlug: 'lighting', priceGel: 210, storeSlug: 'lumina', nameKa: 'ჭერის სანათი „Globe“ — შუშა', nameEn: 'Ceiling lamp "Globe" — glass', nameRu: 'Потолочный светильник «Globe» — стекло', styles: ['modern', 'scandinavian'] },
  },
  {
    slug: 'ceiling-pendant',
    kinds: ['light_ceiling'],
    mount: 'ceiling',
    source: { type: 'polypizza', id: 'sRNcgQFbLB', url: `${PP}/7f5240a6-e02a-4084-b899-8b84784cd76d.glb`, title: 'Ceiling Light', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    product: { kind: 'light_ceiling', categorySlug: 'lighting', priceGel: 120, storeSlug: 'lumina', nameKa: 'ჭერის სანათი „Pendant“ — თეთრი', nameEn: 'Pendant light "Pendant" — white', nameRu: 'Подвесной светильник «Pendant» — белый', styles: ['scandinavian', 'modern'] },
  },
  {
    slug: 'ceiling-disc',
    kinds: ['light_ceiling'],
    mount: 'ceiling',
    source: { type: 'polypizza', id: 'zePBAxDGmw', url: `${PP}/1c792cbc-e19c-4884-8e44-7fc5c9595e9b.glb`, title: 'Ceiling Lamp', author: 'Zsky', license: 'CC-BY 3.0' },
    keepAxes: true,
    product: { kind: 'light_ceiling', categorySlug: 'lighting', priceGel: 95, storeSlug: 'lumina', nameKa: 'ჭერის სანათი „Disc“ — შავი', nameEn: 'Ceiling lamp "Disc" — black', nameRu: 'Потолочный светильник «Disc» — чёрный', styles: ['modern', 'industrial'] },
  },
  {
    slug: 'ceiling-rose',
    kinds: [],
    mount: 'ceiling',
    role: 'rose',
    source: { type: 'polypizza', id: '7-ZyHe177WV', url: `${PP}/54c29500-2d8a-4d71-9e14-e0d4e0daca7f.glb`, title: 'Ceiling Light', author: 'Jarlan Perez', license: 'CC-BY 3.0' },
    keepAxes: true,
    sizeCm: { width: 12, height: 5 },
  },
  {
    slug: 'spot-flush',
    kinds: ['light_spot'],
    mount: 'ceiling',
    source: { type: 'polypizza', id: '7-ZyHe177WV', url: `${PP}/54c29500-2d8a-4d71-9e14-e0d4e0daca7f.glb`, title: 'Ceiling Light', author: 'Jarlan Perez', license: 'CC-BY 3.0' },
    keepAxes: true,
    sizeCm: { width: 10, height: 4 },
    product: { kind: 'light_spot', categorySlug: 'lighting', priceGel: 35, storeSlug: 'lumina', nameKa: 'სპოტი „Flush“ — ჩაშენებული, თეთრი', nameEn: 'Spot "Flush" — recessed, white', nameRu: 'Спот «Flush» — встраиваемый, белый' },
  },
  {
    slug: 'spot-square',
    kinds: ['light_spot'],
    mount: 'ceiling',
    source: { type: 'polypizza', id: 'AAJ1hFnGaH', url: `${PP}/dd610517-0eee-46fa-bcd4-8fc5e98f6cdd.glb`, title: 'Lamp Square Ceiling', author: 'Kenney', license: 'CC0' },
    keepAxes: true,
    sizeCm: { width: 10, height: 20 },
    product: { kind: 'light_spot', categorySlug: 'lighting', priceGel: 55, storeSlug: 'lumina', nameKa: 'სპოტი „Square“ — კრემისფერი', nameEn: 'Spot "Square" — cream', nameRu: 'Спот «Square» — кремовый', styles: ['modern', 'scandinavian'] },
  },

  // --- strips: one photoscanned tube, stretched to the length of the point ----------------
  {
    slug: 'strip-led',
    kinds: ['light_strip'],
    mount: 'wall',
    source: { type: 'polyhaven', id: 'mounted_fluorescent_lights' },
    keepNodes: /_a$/,
    keepAxes: true,
    product: { kind: 'light_strip', categorySlug: 'lighting', priceGel: 25, unit: 'linear_m', storeSlug: 'lumina', nameKa: 'LED ლენტი — მეტრი', nameEn: 'LED strip — per metre', nameRu: 'LED-лента — метр' },
  },
  {
    slug: 'strip-furniture',
    kinds: ['light_furniture'],
    mount: 'wall',
    source: { type: 'polyhaven', id: 'mounted_fluorescent_lights' },
    keepNodes: /_a$/,
    keepAxes: true,
    product: { kind: 'light_furniture', categorySlug: 'lighting', priceGel: 30, unit: 'linear_m', storeSlug: 'lumina', nameKa: 'ავეჯის LED განათება — მეტრი', nameEn: 'Furniture LED light — per metre', nameRu: 'LED-подсветка мебели — метр' },
  },

  // --- doors: the leaf hangs from x min, the room side is +z ------------------------------
  {
    slug: 'door-frame',
    kinds: [],
    mount: 'door',
    role: 'casing',
    source: { type: 'polypizza', id: '47UrLi5nPC', url: `${PP}/549b70ea-4bd8-4705-b264-6fc03f528a5c.glb`, title: 'Doorway Open', author: 'Kenney', license: 'CC0' },
    keepAxes: true,
    leaf: 'none',
    sizeCm: { width: 96, height: 212 },
  },
  {
    slug: 'door-oak',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: 'a948jjnuaL', url: `${PP}/ef9c0c29-7571-4599-b9ad-c4f9279557a5.glb`, title: 'Door', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    leaf: { nodes: /^(Door|DoorHandle)$/ },
    mirror: true,
    sizeCm: { width: 96, height: 212 },
    product: { kind: 'door', categorySlug: 'doors', priceGel: 620, storeSlug: 'domus-interior', nameKa: 'შიდა კარი „Oak“ — ხის, კოლოფით', nameEn: 'Interior door "Oak" — wood, with frame', nameRu: 'Межкомнатная дверь «Oak» — дерево, с коробкой', styles: ['vintage', 'industrial'] },
  },
  {
    slug: 'door-nordic',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: 'LI93WgnjyS', url: `${PP}/df219d1d-2583-4082-b150-f7529527a63a.glb`, title: 'Door', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    leaf: { box: { x: [0.04, 0.96], y: [0, 0.985] } },
    mirror: true,
    sizeCm: { width: 96, height: 212 },
    product: { kind: 'door', categorySlug: 'doors', priceGel: 540, storeSlug: 'domus-interior', nameKa: 'შიდა კარი „Nordic“ — თეთრი, ფილენკებით', nameEn: 'Interior door "Nordic" — white, panelled', nameRu: 'Межкомнатная дверь «Nordic» — белая, филёнчатая', styles: ['scandinavian', 'modern'] },
  },
  {
    slug: 'door-flat',
    kinds: [],
    mount: 'door',
    role: 'door',
    source: { type: 'polypizza', id: 'KGt4ztcKrM', url: `${PP}/4b6e7e8c-d973-4a0c-b0ea-edc7ed04eca9.glb`, title: 'Door', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    leaf: { box: { x: [0.035, 0.965], y: [0, 0.985] } },
    mirror: true,
    sizeCm: { width: 96, height: 212 },
    product: { kind: 'door', categorySlug: 'doors', priceGel: 460, storeSlug: 'domus-interior', nameKa: 'შიდა კარი „Flat“ — თეთრი, გლუვი', nameEn: 'Interior door "Flat" — white, flush', nameRu: 'Межкомнатная дверь «Flat» — белая, гладкая', styles: ['modern'] },
  },
  {
    slug: 'door-classic',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: '00xFHE4LR_6', url: `${PP}/3d0ad2c5-5260-41be-a64a-d693c9d4cac9.glb`, title: 'Nice Door', author: 'Wesley Thompson', license: 'CC-BY 3.0' },
    leaf: { nodes: /^group1559002970$/ },
    mirror: true,
    sizeCm: { width: 96, height: 212 },
    product: { kind: 'door', categorySlug: 'doors', priceGel: 580, storeSlug: 'domus-interior', nameKa: 'შიდა კარი „Classic“ — თეთრი, კოლოფით', nameEn: 'Interior door "Classic" — white, with frame', nameRu: 'Межкомнатная дверь «Classic» — белая, с коробкой', styles: ['vintage', 'scandinavian'] },
  },
  {
    slug: 'door-country',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: 'P09FqyST04', url: `${PP}/16c02d69-21ae-49c2-bed1-6325570e356a.glb`, title: 'Wooden Door', author: 'Kenney', license: 'CC0' },
    leaf: 'all',
    mirror: true,
    sizeCm: { width: 86, height: 205 },
    product: { kind: 'door', categorySlug: 'doors', priceGel: 390, storeSlug: 'domus-interior', nameKa: 'შიდა კარი „Country“ — ხის ფრთა', nameEn: 'Interior door "Country" — wooden leaf', nameRu: 'Межкомнатная дверь «Country» — деревянное полотно', styles: ['vintage', 'industrial'] },
  },
  {
    slug: 'entrance-door-classic',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: 'xuFNaNLzfE', url: `${PP}/d1d3f4a8-487b-4108-a708-2306af98ea61.glb`, title: 'Door', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    leaf: { box: { x: [0.04, 0.96], y: [0, 0.985] } },
    mirror: true,
    sizeCm: { width: 100, height: 215 },
    product: { kind: 'entrance_door', categorySlug: 'doors', priceGel: 1350, storeSlug: 'domus-interior', nameKa: 'შესასვლელი კარი „Classic“ — მუქი ხე', nameEn: 'Entrance door "Classic" — dark wood', nameRu: 'Входная дверь «Classic» — тёмное дерево', styles: ['vintage', 'industrial'] },
  },
  {
    slug: 'entrance-door-metal',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: 'PCJv96DB6b', url: `${PP}/e2a6d12c-18e6-4bd5-9426-de6aebdd8a90.glb`, title: 'Metal Door', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    leaf: 'all',
    mirror: true,
    sizeCm: { width: 90, height: 210 },
    product: { kind: 'entrance_door', categorySlug: 'doors', priceGel: 1600, storeSlug: 'domus-interior', nameKa: 'შესასვლელი კარი „Metal“ — თეთრი, ფანჯრებით', nameEn: 'Entrance door "Metal" — white, glazed', nameRu: 'Входная дверь «Metal» — белая, с окошками', styles: ['modern', 'industrial'] },
  },
  {
    slug: 'entrance-door-red',
    kinds: [],
    mount: 'door',
    source: { type: 'polypizza', id: 'NZxf87zEEm', url: `${PP}/64ff52cb-76d7-437d-a25d-82825247609d.glb`, title: 'Red Door', author: 'Kenney', license: 'CC0' },
    leaf: 'all',
    mirror: true,
    sizeCm: { width: 86, height: 205 },
    product: { kind: 'entrance_door', categorySlug: 'doors', priceGel: 1100, storeSlug: 'domus-interior', nameKa: 'შესასვლელი კარი „Red“ — ფანჯრით', nameEn: 'Entrance door "Red" — glazed', nameRu: 'Входная дверь «Red» — с окошком', styles: ['scandinavian', 'modern'] },
  },

  // --- windows: one piece, the room side is +z --------------------------------------------
  {
    slug: 'window-nordic',
    kinds: [],
    mount: 'window',
    role: 'window',
    source: { type: 'polypizza', id: 'n88WAcjzTv', url: `${PP}/0ab1cc08-63fe-4b22-a166-ea8ac20ae307.glb`, title: 'Window Small', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    sizeCm: { width: 90, height: 120 },
    product: { kind: 'window', categorySlug: 'windows', priceGel: 480, storeSlug: 'domus-interior', nameKa: 'ფანჯარა „Nordic“ — თეთრი, ორფრთიანი', nameEn: 'Window "Nordic" — white, two-leaf', nameRu: 'Окно «Nordic» — белое, двустворчатое', styles: ['scandinavian', 'modern'] },
  },
  {
    slug: 'window-grid',
    kinds: [],
    mount: 'window',
    source: { type: 'polypizza', id: 'EipzkrS9nG', url: `${PP}/23e1676f-9152-4fe9-917c-6b98aa66cbe0.glb`, title: 'Window Large', author: 'Quaternius', license: 'CC0' },
    keepAxes: true,
    sizeCm: { width: 180, height: 150 },
    product: { kind: 'window', categorySlug: 'windows', priceGel: 760, storeSlug: 'domus-interior', nameKa: 'ფანჯარა „Grid“ — თეთრი, დიდი', nameEn: 'Window "Grid" — white, large', nameRu: 'Окно «Grid» — белое, большое', styles: ['industrial', 'modern'] },
  },
  {
    slug: 'window-wood',
    kinds: [],
    mount: 'window',
    source: { type: 'polypizza', id: 'dwBpM-aSA_t', url: `${PP}/651a4ee6-8233-4029-93ef-f3d67f24a940.glb`, title: 'Window', author: 'Justin Randall', license: 'CC-BY 3.0' },
    sizeCm: { width: 100, height: 120 },
    product: { kind: 'window', categorySlug: 'windows', priceGel: 520, storeSlug: 'domus-interior', nameKa: 'ფანჯარა „Wood“ — ხის ჩარჩო, 4 მინა', nameEn: 'Window "Wood" — wooden frame, four panes', nameRu: 'Окно «Wood» — деревянная рама, 4 стекла', styles: ['vintage', 'scandinavian'] },
  },
  {
    slug: 'window-square',
    kinds: [],
    mount: 'window',
    source: { type: 'polypizza', id: '0BEn8hO2Nbn', url: `${PP}/dc5eaf8b-f848-4dce-8839-2b7eaf436b0f.glb`, title: 'Square window', author: 'Poly by Google', license: 'CC-BY 3.0' },
    sizeCm: { width: 120, height: 120 },
    product: { kind: 'window', categorySlug: 'windows', priceGel: 430, storeSlug: 'domus-interior', nameKa: 'ფანჯარა „Square“ — თეთრი', nameEn: 'Window "Square" — white', nameRu: 'Окно «Square» — белое', styles: ['modern'] },
  },
];

export interface FixtureManifestModel {
  slug: string;
  kinds: ElectricalKind[];
  mount: Mount;
  url: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  triangles: number;
  bytes: number;
  source: 'polyhaven' | 'polypizza';
  sourceUrl: string;
  title: string;
  author: string;
  license: string;
  /** Doors: which named nodes the file has — `leaf` swings, `frame` is the casing, `body` is one welded piece. */
  parts?: Array<'frame' | 'leaf' | 'body'>;
  /** The product's photo, under /uploads/furniture. */
  imageUrl: string | null;
  /** What the studio draws this for by default (see `FixtureEntry.role`). */
  role?: 'door' | 'window' | 'casing' | 'rose';
  /** The catalogue product this model is sold as, when it is one. */
  product?: { kind: string; categorySlug: string; priceGel: number; unit?: 'piece' | 'linear_m'; storeSlug: string; nameKa: string; nameEn: string; nameRu: string; styles?: StyleId[] };
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const entries = only ? FIXTURES.filter((e) => only.includes(e.slug)) : FIXTURES;
  if (entries.length === 0) throw new Error(`nothing matches --only=${only?.join(',')}`);
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(PHOTO_DIR, { recursive: true });

  const models: FixtureManifestModel[] = [];
  const failed: string[] = [];
  for (const entry of entries) {
    process.stdout.write(`• ${entry.slug} `);
    try {
      const model = await convertOne(entry);
      models.push(model);
      console.log(`✓ ${model.widthCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(0)} KB`);
    } catch (error) {
      failed.push(`${entry.slug} — ${(error as Error).message}`);
      console.log(`✗ ${(error as Error).message}`);
    }
  }

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let all = models;
  if (only && existsSync(manifestPath)) {
    const previous = (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: FixtureManifestModel[] }).models;
    all = [...previous.filter((m) => !models.some((n) => n.slug === m.slug)), ...models];
    all.sort((a, b) => FIXTURES.findIndex((e) => e.slug === a.slug) - FIXTURES.findIndex((e) => e.slug === b.slug));
  }
  await writeFile(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), note: 'Written by scripts/fixture-models.ts. Wall fixtures are centred on x/y with the back on z = 0 and the front along +z; ceiling fixtures centred on x/z with the top at y = 0; doors and windows centred on x/z, standing on y = 0, the room side along +z, a door’s leaf (node `leaf`) hung from x min.', models: all }, null, 2) + '\n'
  );
  await writeFile(
    TS_OUT,
    `/**\n * Generated by scripts/fixture-models.ts — do not edit. The 3D fixtures in public/models/fixtures:\n * the electrical layer's sockets, switches and lamps (one entry per model with the kinds it\n * stands for) and the doors and windows (kinds empty; \`parts\` names the nodes a door has).\n */\n\nimport type { ElectricalKind } from '@/lib/design/types';\n\nexport interface FixtureModel {\n  slug: string;\n  kinds: ElectricalKind[];\n  mount: 'wall' | 'ceiling' | 'door' | 'window';\n  url: string;\n  widthCm: number;\n  heightCm: number;\n  depthCm: number;\n  parts?: Array<'frame' | 'leaf' | 'body'>;\n  /** What the studio draws this for when nothing is chosen: a door or window without a product, the casing of a bare leaf and of an archway, the rose under a catalogue lamp. */\n  role?: 'door' | 'window' | 'casing' | 'rose';\n  license: string;\n  author: string;\n}\n\nexport const FIXTURE_MODELS: FixtureModel[] = ${JSON.stringify(
      all.map(({ slug, kinds, mount, url, widthCm, heightCm, depthCm, parts, role, license, author }) => ({ slug, kinds, mount, url, widthCm, heightCm, depthCm, ...(parts ? { parts } : {}), ...(role ? { role } : {}), license, author })),
      null,
      2
    )};\n`
  );
  console.log(`\n${all.length} fixtures in manifest · ${path.relative(ROOT, OUT_DIR)}`);
  if (failed.length) {
    console.log(`\n${failed.length} failed:\n${failed.map((f) => `  · ${f}`).join('\n')}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Poly Haven's 1k glTF with its textures, cached; returns the .gltf path. */
async function fetchPolyHaven(id: string): Promise<string> {
  const dir = path.join(CACHE_DIR, 'polyhaven', id);
  const gltf = path.join(dir, `${id}_1k.gltf`);
  if (existsSync(gltf)) return gltf;
  await mkdir(path.join(dir, 'textures'), { recursive: true });
  const files = JSON.parse(Buffer.from(await fetchBytes(`https://api.polyhaven.com/files/${id}`)).toString('utf8')) as {
    gltf?: Record<string, { gltf: { url: string; include: Record<string, { url: string }> } }>;
  };
  const level = files.gltf?.['1k']?.gltf;
  if (!level) throw new Error('Poly Haven has no 1k glTF for this asset');
  const jobs: Array<Promise<void>> = [fetchBytes(level.url).then((data) => writeFile(`${gltf}.part`, data))];
  for (const [name, file] of Object.entries(level.include)) {
    const out = path.join(dir, name);
    jobs.push(
      mkdir(path.dirname(out), { recursive: true })
        .then(() => fetchBytes(file.url))
        .then((data) => writeFile(out, data))
    );
  }
  await Promise.all(jobs);
  await writeFile(gltf, await readFile(`${gltf}.part`));
  await rm(`${gltf}.part`, { force: true });
  return gltf;
}

/** A poly.pizza GLB, cached. */
async function fetchPolyPizza(id: string, url: string): Promise<string> {
  const file = path.join(CACHE_DIR, 'polypizza', `${id}.glb`);
  if (existsSync(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await fetchBytes(url));
  return file;
}

// ---------------------------------------------------------------------------
// One model
// ---------------------------------------------------------------------------

async function convertOne(entry: FixtureEntry): Promise<FixtureManifestModel> {
  const source = entry.source.type === 'polyhaven' ? await fetchPolyHaven(entry.source.id) : await fetchPolyPizza(entry.source.id, entry.source.url);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(source);
  const opening = entry.mount === 'door' || entry.mount === 'window';

  await doc.transform(dedup(), flatten());
  if (entry.keepNodes) {
    for (const node of doc.getRoot().listNodes()) {
      if (node.getMesh() && !entry.keepNodes.test(node.getName())) node.dispose();
    }
    await doc.transform(prune());
  }
  if (opening) {
    // A door keeps its parts apart until the leaf is told from the frame below.
    bakeNodeTransforms(doc);
    await doc.transform(weld(), prune());
  } else {
    await doc.transform(join({ keepNamed: false, keepMeshes: false }), weld(), prune());
    bakeNodeTransforms(doc);
  }

  for (const error of [0.003, 0.008, 0.02]) {
    const current = countTriangles(doc);
    if (current <= TARGET_TRIANGLES * 1.2) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIANGLES / current, error }));
  }
  await doc.transform(prune());

  // --- orient ---------------------------------------------------------------
  if (entry.flipY) transformAll(doc, (p) => [p[0], -p[1], -p[2]]);
  if (!entry.keepAxes) {
    // A plate: its thinnest axis is the depth, which has to be z.
    const b = boundsOf(doc);
    const size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
    const thin = size.indexOf(Math.min(...size));
    if (thin === 0) transformAll(doc, (p) => [-p[2], p[1], p[0]]);
    else if (thin === 1) transformAll(doc, (p) => [p[0], -p[2], p[1]]);
  }
  if (entry.yawDegrees) {
    const a = (entry.yawDegrees * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    transformAll(doc, (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]);
  }

  // --- parts ----------------------------------------------------------------
  // With the model upright and facing +z, a door is told apart into its leaf and its frame
  // (or kept as one body), and a leaf hung from the right jamb is mirrored to the left.
  let parts: FixtureManifestModel['parts'];
  if (opening) parts = partitionOpening(doc, entry);
  if (entry.mirror) transformAll(doc, (p) => [-p[0], p[1], p[2]]);

  // --- size -----------------------------------------------------------------
  let b = boundsOf(doc);
  let size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  if (entry.sizeCm) {
    if (opening) {
      // A door or a window is stretched to its nominal size — the studio stretches it to
      // the opening anyway — and its depth follows the mean of the two.
      const sx = entry.sizeCm.width / 100 / size[0];
      const sy = entry.sizeCm.height / 100 / size[1];
      const sz = Math.sqrt(sx * sy);
      transformPositions(doc, (p) => [p[0] * sx, p[1] * sy, p[2] * sz]);
    } else {
      const scale = Math.max(entry.sizeCm.width, entry.sizeCm.height) / 100 / Math.max(size[0], size[1]);
      transformPositions(doc, (p) => [p[0] * scale, p[1] * scale, p[2] * scale]);
    }
    b = boundsOf(doc);
    size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  }

  // --- frame ----------------------------------------------------------------
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  if (entry.mount === 'wall') transformPositions(doc, (p) => [p[0] - cx, p[1] - cy, p[2] - b.min[2]]);
  else if (entry.mount === 'ceiling') transformPositions(doc, (p) => [p[0] - cx, p[1] - b.max[1], p[2] - cz]);
  else transformPositions(doc, (p) => [p[0] - cx, p[1] - b.min[1], p[2] - cz]);

  const triangles = countTriangles(doc);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT_DIR, `${entry.slug}.glb`);
  await io.write(out, doc);
  let { size: bytes } = await stat(out);
  if (bytes > MAX_BYTES) {
    await shrinkTextures(doc, 512);
    await io.write(out, doc);
    ({ size: bytes } = await stat(out));
  }

  const src = entry.source;
  const imageUrl = await placePhoto(entry);
  return {
    slug: entry.slug,
    kinds: entry.kinds,
    mount: entry.mount,
    url: `/models/fixtures/${entry.slug}.glb`,
    widthCm: Math.round(size[0] * 100),
    heightCm: Math.round(size[1] * 100),
    depthCm: Math.round(size[2] * 100),
    triangles,
    bytes,
    source: src.type,
    sourceUrl: src.type === 'polyhaven' ? `https://polyhaven.com/a/${src.id}` : `https://poly.pizza/m/${src.id}`,
    title: src.type === 'polyhaven' ? src.id.replace(/_/g, ' ') : src.title,
    author: src.type === 'polyhaven' ? 'Poly Haven' : src.author,
    license: src.type === 'polyhaven' ? 'CC0' : src.license,
    ...(parts ? { parts } : {}),
    ...(entry.role ? { role: entry.role } : {}),
    imageUrl,
    ...(entry.product ? { product: entry.product } : {}),
  };
}

/**
 * Sorts a door's geometry into the node `leaf` (what swings) and the node `frame` (the
 * casing), or leaves a window — and a door drawn closed — as one node `body`. The source's
 * own nodes go; every primitive ends up under one of the three, so the studio can find the
 * leaf by name and hang it from its jamb.
 */
function partitionOpening(doc: Document, entry: FixtureEntry): NonNullable<FixtureManifestModel['parts']> {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  const rule: LeafRule = entry.mount === 'door' ? (entry.leaf ?? 'none') : 'none';
  const leaf: Primitive[] = [];
  const rest: Primitive[] = [];
  if (rule === 'all') for (const n of meshNodes) leaf.push(...n.getMesh()!.listPrimitives());
  else if (rule === 'none') for (const n of meshNodes) rest.push(...n.getMesh()!.listPrimitives());
  else if ('nodes' in rule) for (const n of meshNodes) (rule.nodes.test(n.getName()) ? leaf : rest).push(...n.getMesh()!.listPrimitives());
  else {
    const b = boundsOf(doc);
    const box = {
      x0: b.min[0] + rule.box.x[0] * (b.max[0] - b.min[0]),
      x1: b.min[0] + rule.box.x[1] * (b.max[0] - b.min[0]),
      y0: b.min[1] + rule.box.y[0] * (b.max[1] - b.min[1]),
      y1: b.min[1] + rule.box.y[1] * (b.max[1] - b.min[1]),
    };
    for (const n of meshNodes) {
      for (const prim of n.getMesh()!.listPrimitives()) {
        const [inside, outside] = splitByCentroid(doc, prim, box);
        if (inside) leaf.push(inside);
        if (outside) rest.push(outside);
      }
    }
  }
  if (rule !== 'none' && leaf.length === 0) throw new Error('the leaf rule matched nothing');

  // The source's meshes go with their nodes: an empty mesh left behind would trip the
  // quantiser, which measures every mesh's bounds.
  for (const n of meshNodes) {
    const mesh = n.getMesh()!;
    for (const prim of mesh.listPrimitives()) mesh.removePrimitive(prim);
    n.setMesh(null);
    n.dispose();
    if (mesh.listParents().every((parent) => parent.propertyType === 'Root')) mesh.dispose();
  }
  const parts: NonNullable<FixtureManifestModel['parts']> = [];
  const add = (name: 'frame' | 'leaf' | 'body', prims: Primitive[]) => {
    if (prims.length === 0) return;
    const mesh = doc.createMesh(name);
    for (const prim of prims) mesh.addPrimitive(prim);
    scene.addChild(doc.createNode(name).setMesh(mesh));
    parts.push(name);
  };
  add(rule === 'none' ? 'body' : 'frame', rest);
  add('leaf', leaf);
  return parts;
}

/** Two primitives sharing the vertex data of `prim`: the triangles whose centre is in the box, and the others. */
function splitByCentroid(doc: Document, prim: Primitive, box: { x0: number; x1: number; y0: number; y1: number }): [Primitive | null, Primitive | null] {
  const position = prim.getAttribute('POSITION')!.getArray()!;
  const indices = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: position.length / 3 }, (_, i) => i);
  const inside: number[] = [];
  const outside: number[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    let cx = 0;
    let cy = 0;
    for (const v of [indices[t], indices[t + 1], indices[t + 2]]) {
      cx += position[v * 3];
      cy += position[v * 3 + 1];
    }
    cx /= 3;
    cy /= 3;
    const hit = cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1;
    (hit ? inside : outside).push(indices[t], indices[t + 1], indices[t + 2]);
  }
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const make = (list: number[]) => {
    if (list.length === 0) return null;
    const copy = prim.clone();
    copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(list)).setBuffer(buffer));
    return copy;
  };
  return [make(inside), make(outside)];
}

/**
 * The product photo: the one `pnpm models:photos` rendered when there is one, otherwise the
 * source's own render of the model, fetched once.
 */
async function placePhoto(entry: FixtureEntry): Promise<string | null> {
  const rendered = path.join(PHOTO_DIR, `fixture-${entry.slug}.png`);
  if (existsSync(rendered)) return `/uploads/furniture/fixture-${entry.slug}.png`;
  const src = entry.source;
  const url = src.type === 'polyhaven' ? `https://cdn.polyhaven.com/asset_img/primary/${src.id}.png?width=600` : src.url.replace(/\.glb$/, '.jpg');
  const ext = src.type === 'polyhaven' ? 'png' : 'jpg';
  const file = path.join(PHOTO_DIR, `fixture-${entry.slug}.${ext}`);
  try {
    if (!existsSync(file)) await writeFile(file, await fetchBytes(url));
    return `/uploads/furniture/fixture-${entry.slug}.${ext}`;
  } catch (error) {
    console.warn(`(no photo: ${(error as Error).message}) `);
    return null;
  }
}

// ---------------------------------------------------------------------------
// glTF helpers (the same ones the stock script uses)
// ---------------------------------------------------------------------------

function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  }
  return Math.round(n);
}

function boundsOf(doc: Document): { min: number[]; max: number[] } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  return getBounds(scene);
}

function listPrimitives(doc: Document): Primitive[] {
  return doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
}

function transformPositions(doc: Document, fn: (p: number[]) => number[]): void {
  const done = new Set<object>();
  for (const prim of listPrimitives(doc)) {
    const accessor = prim.getAttribute('POSITION');
    if (!accessor || done.has(accessor)) continue;
    done.add(accessor);
    const array = Float32Array.from(accessor.getArray()!);
    for (let i = 0; i < array.length; i += 3) {
      const [x, y, z] = fn([array[i], array[i + 1], array[i + 2]]);
      array[i] = x;
      array[i + 1] = y;
      array[i + 2] = z;
    }
    accessor.setArray(array);
  }
}

function transformNormals(doc: Document, fn: (n: number[]) => number[]): void {
  const done = new Set<object>();
  for (const prim of listPrimitives(doc)) {
    const accessor = prim.getAttribute('NORMAL');
    if (!accessor || done.has(accessor)) continue;
    done.add(accessor);
    const array = Float32Array.from(accessor.getArray()!);
    for (let i = 0; i < array.length; i += 3) {
      const [x, y, z] = fn([array[i], array[i + 1], array[i + 2]]);
      const len = Math.hypot(x, y, z) || 1;
      array[i] = x / len;
      array[i + 1] = y / len;
      array[i + 2] = z / len;
    }
    accessor.setArray(array);
  }
}

/** A rotation or reflection applied to positions and normals alike. */
function transformAll(doc: Document, fn: (p: number[]) => number[]): void {
  transformPositions(doc, fn);
  transformNormals(doc, fn);
  // A reflection turns the winding inside out; flip the indices back.
  const det = determinant(fn);
  if (det < 0) {
    const done = new Set<object>();
    for (const prim of listPrimitives(doc)) {
      const indices = prim.getIndices();
      if (!indices || done.has(indices)) continue;
      done.add(indices);
      const array = Array.from(indices.getArray()!);
      for (let i = 0; i + 2 < array.length; i += 3) [array[i + 1], array[i + 2]] = [array[i + 2], array[i + 1]];
      indices.setArray(indices.getArray() instanceof Uint16Array ? Uint16Array.from(array) : Uint32Array.from(array));
    }
  }
}

function determinant(fn: (p: number[]) => number[]): number {
  const [a, b, c] = [fn([1, 0, 0]), fn([0, 1, 0]), fn([0, 0, 1])];
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function bakeNodeTransforms(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    const identity = matrix.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
    if (identity) continue;
    const owners = mesh.listParents().filter((p) => p.propertyType === 'Node');
    const target = owners.length > 1 ? mesh.clone() : mesh;
    if (target !== mesh) node.setMesh(target);
    const m = matrix;
    const transformPoint = (p: number[]) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
    const transformDirection = (d: number[]) => {
      const v = [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / len, v[1] / len, v[2] / len];
    };
    const done = new Set<object>();
    for (const prim of target.listPrimitives()) {
      for (const semantic of ['POSITION', 'NORMAL', 'TANGENT']) {
        const accessor = prim.getAttribute(semantic);
        if (!accessor || done.has(accessor)) continue;
        if (accessor.listParents().filter((p) => p.propertyType === 'Primitive').length > 1) prim.setAttribute(semantic, accessor.clone());
        const own = prim.getAttribute(semantic)!;
        done.add(own);
        const stride = own.getElementSize();
        const array = Float32Array.from(own.getArray()!);
        for (let i = 0; i < array.length; i += stride) {
          const out = semantic === 'POSITION' ? transformPoint([array[i], array[i + 1], array[i + 2]]) : transformDirection([array[i], array[i + 1], array[i + 2]]);
          array[i] = out[0];
          array[i + 1] = out[1];
          array[i + 2] = out[2];
        }
        own.setArray(array);
      }
    }
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
}

async function shrinkTextures(doc: Document, px: number): Promise<void> {
  const work = await mkdtemp(path.join(os.tmpdir(), 'rr-fixture-tex-'));
  try {
    let i = 0;
    for (const texture of doc.getRoot().listTextures()) {
      const image = texture.getImage();
      if (!image) continue;
      const ext = texture.getMimeType() === 'image/png' ? 'png' : 'jpg';
      const src = path.join(work, `${i}.${ext}`);
      const dst = path.join(work, `${i}-small.${ext}`);
      i++;
      await writeFile(src, image);
      await run('sips', ext === 'png' ? ['-Z', String(px), src, '--out', dst] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(px), src, '--out', dst]);
      texture.setImage(new Uint8Array(await readFile(dst)));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
