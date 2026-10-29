/**
 * The showers' trays and glass in 3D (`lib/design/shower`): a low white tray over the shower's
 * floor, and each pane of its glass a sheet of clear glass with a thin metal top rail, as tall
 * and as thick as the piece says. Picked, a pane is its shower (`pickKind: 'item'`).
 *
 * Rebuilt with the furniture and the plan (a few boxes a shower); the three materials are shared
 * and let go with the viewer (`releaseShowerGlassMaterials`).
 */

import * as THREE from 'three';
import { showerArea, showerGlass } from '@/lib/design/shower';
import type { FloorPlan, PlacedItem } from '@/lib/design/types';
import { releaseMaterial } from './gpuRelease';

const TRAY_M = 0.025;
const RAIL_M = 0.015;

let shared: { glass: THREE.MeshStandardMaterial; rail: THREE.MeshStandardMaterial; tray: THREE.MeshStandardMaterial } | null = null;

function materials() {
  shared ??= {
    // Plain transparency, not transmission: transmission renders the flat twice (glass.ts).
    glass: new THREE.MeshStandardMaterial({ name: 'shower-glass', color: 0xdcebf3, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ name: 'shower-rail', color: 0xc9ccd0, roughness: 0.25, metalness: 0.85 }),
    tray: new THREE.MeshStandardMaterial({ name: 'shower-tray', color: 0xefefec, roughness: 0.5 }),
  };
  return shared;
}

/** The shared materials let go of the renderer that is going away (`gpuRelease.ts`). */
export function releaseShowerGlassMaterials(): void {
  if (!shared) return;
  for (const material of Object.values(shared)) releaseMaterial(material);
}

function owned(mesh: THREE.Mesh, item: PlacedItem): THREE.Mesh {
  mesh.userData = { ownsGeometry: true, pickKind: 'item', itemId: item.id, roomId: item.roomId };
  return mesh;
}

/** Every shower's tray and glass in the rooms in view (all of them with no filter). */
export function buildShowerGlass(plan: FloorPlan, items: PlacedItem[], rooms: Set<string> | null): THREE.Group {
  const root = new THREE.Group();
  root.name = 'shower-glass';
  const m = materials();
  for (const item of items) {
    if (rooms && !rooms.has(item.roomId)) continue;
    const area = showerArea(item);
    const room = area ? plan.rooms.find((r) => r.id === item.roomId) : undefined;
    if (!area || !room) continue;
    const tray = owned(new THREE.Mesh(new THREE.BoxGeometry(area.width, TRAY_M, area.depth), m.tray), item);
    tray.position.set(area.centre.x, TRAY_M / 2, area.centre.z);
    tray.rotation.y = area.rotation;
    tray.receiveShadow = true;
    root.add(tray);
    for (const pane of showerGlass(item, room)) {
      const length = Math.hypot(pane.b.x - pane.a.x, pane.b.z - pane.a.z);
      if (length < 0.05) continue;
      const yaw = Math.atan2(-(pane.b.z - pane.a.z), pane.b.x - pane.a.x);
      const mid = { x: (pane.a.x + pane.b.x) / 2, z: (pane.a.z + pane.b.z) / 2 };
      // The drawn thickness is the plan's (2–5 cm); real glass is 8–10 mm, the rest is its frame.
      const sheet = owned(new THREE.Mesh(new THREE.BoxGeometry(length, pane.heightM - RAIL_M, Math.min(pane.thicknessM, 0.012)), m.glass), item);
      sheet.position.set(mid.x, TRAY_M + (pane.heightM - RAIL_M) / 2, mid.z);
      sheet.rotation.y = yaw;
      sheet.renderOrder = 2;
      const rail = owned(new THREE.Mesh(new THREE.BoxGeometry(length, RAIL_M, pane.thicknessM), m.rail), item);
      rail.position.set(mid.x, TRAY_M + pane.heightM - RAIL_M / 2, mid.z);
      rail.rotation.y = yaw;
      rail.castShadow = true;
      root.add(sheet, rail);
    }
  }
  return root;
}
