/**
 * An icon per room and per archetype for the furniture shelf — a picture where the label
 * used to be, the way a game's build catalogue does it. The shelf is two levels of these:
 * the rooms, then the kinds that belong in the room.
 *
 * Every kind has an icon of its own. Lucide covers the appliances and the soft goods, but
 * its `Table` icons are spreadsheet grids and it has one sofa, so the furniture it lacks —
 * the tables, the chairs, the storage, the corner sofa, the rugs — is drawn here in its
 * idiom (24 × 24, stroked, `createLucideIcon`), and the two sofas or the two beds can be
 * told apart at a glance. Kinds added later fall back to a plain package.
 */

import { Armchair, Bath, BedDouble, BedSingle, Blinds, BriefcaseBusiness, CookingPot, DoorOpen, Flower2, Footprints, Image as ImageIcon, LampCeiling, LampFloor, LibraryBig, Package, Refrigerator, Rows3, Shirt, ShowerHead, Sofa, Sun, Toilet, Tv, UtensilsCrossed, Warehouse, WashingMachine, createLucideIcon, type LucideIcon } from 'lucide-react';
import type { RoomType } from '@/lib/calculator/types';

type Node = [string, Record<string, string>];
const path = (d: string, key: string): Node => ['path', { d, key }];
const rect = (x: number, y: number, width: number, height: number, key: string, rx = 1): Node => ['rect', { x: String(x), y: String(y), width: String(width), height: String(height), rx: String(rx), key }];
const circle = (cx: number, cy: number, r: number, key: string): Node => ['circle', { cx: String(cx), cy: String(cy), r: String(r), key }];

/** An L seen from above: the back runs along the top and down the left. */
const SofaCorner = createLucideIcon('SofaCorner', [path('M3 4h18v9h-8v7H3z', 'body'), path('M7 8h10', 'back'), path('M7 8v8', 'side')]);
const Nightstand = createLucideIcon('Nightstand', [rect(6, 11, 12, 8, 'body'), path('M6 15h12', 'drawer'), path('M11 13h2', 'knob'), path('M8 19v2M16 19v2', 'legs'), path('M12 11V8', 'stem'), path('M9 8h6l-1.5-4h-3z', 'shade')]);
const Wardrobe = createLucideIcon('Wardrobe', [rect(5, 3, 14, 17, 'body'), path('M12 3v17', 'doors'), path('M10 11v2M14 11v2', 'handles'), path('M7 20v1.5M17 20v1.5', 'legs')]);
const Dresser = createLucideIcon('Dresser', [rect(4, 5, 16, 14, 'body'), path('M4 9.7h16M4 14.3h16', 'drawers'), path('M11 7.4h2M11 12h2M11 16.6h2', 'knobs'), path('M6 19v2M18 19v2', 'legs')]);
const CoffeeTable = createLucideIcon('CoffeeTable', [path('M3 10h18', 'top'), path('M6 10v7M18 10v7', 'legs'), path('M6 14h12', 'shelf')]);
const ConsoleTable = createLucideIcon('ConsoleTable', [path('M4 6h16v3H4z', 'top'), path('M6 9v12M18 9v12', 'legs'), path('M11 7.5h2', 'knob')]);
const DiningChair = createLucideIcon('DiningChair', [path('M7 3v18', 'back'), path('M7 7h4M7 10h4', 'slats'), path('M7 13h10', 'seat'), path('M17 13v8', 'leg')]);
const Desk = createLucideIcon('Desk', [path('M3 7h18', 'top'), path('M5 7v13M19 7v13', 'legs'), rect(12, 7, 7, 8, 'drawers', 0.5), path('M12 11h7', 'split'), path('M15 9h1M15 13h1', 'knobs')]);
const OfficeChair = createLucideIcon('OfficeChair', [rect(8, 3, 8, 8, 'back', 2), path('M6 14h12', 'seat'), path('M12 14v4', 'post'), path('M7 21l5-3 5 3', 'base'), path('M6 14v-2M18 14v-2', 'arms')]);
const KitchenRun = createLucideIcon('KitchenRun', [path('M3 8h18', 'worktop'), rect(4, 8, 16, 12, 'body', 0.5), path('M12 8v12', 'doors'), path('M10 12v2M14 12v2', 'handles'), path('M7 8V5h3', 'tap')]);
const KitchenIsland = createLucideIcon('KitchenIsland', [rect(3, 6, 18, 7, 'top', 1), path('M6 13v2M18 13v2', 'body'), circle(8, 19, 1.6, 'stool-a'), circle(16, 19, 1.6, 'stool-b')]);
const Sink = createLucideIcon('Sink', [path('M4 11h16v1a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z', 'basin'), path('M12 11V6a2 2 0 0 1 2-2h1', 'tap'), path('M12 18v3', 'pedestal')]);
const Mirror = createLucideIcon('Mirror', [['ellipse', { cx: '12', cy: '10', rx: '6', ry: '7.5', key: 'glass' }], path('M12 17.5V21', 'stand'), path('M8.5 21h7', 'foot'), path('M10 6.5l-1.5 2.5', 'shine')]);
const Rug = createLucideIcon('Rug', [rect(5, 6, 14, 12, 'rug'), path('M5 9H3M5 12H3M5 15H3', 'fringe-a'), path('M19 9h2M19 12h2M19 15h2', 'fringe-b'), rect(8.5, 9.5, 7, 5, 'border', 0.5)]);
const RugBedside = createLucideIcon('RugBedside', [rect(5, 9, 14, 6, 'rug'), path('M5 11H3M5 13H3', 'fringe-a'), path('M19 11h2M19 13h2', 'fringe-b')]);

const ICONS: Record<string, LucideIcon> = {
  bed_double: BedDouble,
  bed_single: BedSingle,
  nightstand: Nightstand,
  wardrobe: Wardrobe,
  dresser: Dresser,
  sofa_3seat: Sofa,
  sofa_corner: SofaCorner,
  armchair: Armchair,
  coffee_table: CoffeeTable,
  tv_unit: Tv,
  storage_shelf: Rows3,
  bookshelf: LibraryBig,
  dining_table: UtensilsCrossed,
  dining_chair: DiningChair,
  kitchen_run: KitchenRun,
  kitchen_island: KitchenIsland,
  fridge: Refrigerator,
  desk: Desk,
  office_chair: OfficeChair,
  toilet: Toilet,
  sink: Sink,
  shower: ShowerHead,
  bathtub: Bath,
  washer: WashingMachine,
  console_table: ConsoleTable,
  shoe_cabinet: Footprints,
  mirror: Mirror,
  rug: Rug,
  rug_bed: RugBedside,
  floor_lamp: LampFloor,
  pendant: LampCeiling,
  plant: Flower2,
  artwork: ImageIcon,
  curtain: Blinds,
};

export function archetypeIcon(kind: string): LucideIcon {
  return ICONS[kind] ?? Package;
}

const ROOM_ICONS: Record<RoomType, LucideIcon> = {
  living_room: Sofa,
  bedroom: BedDouble,
  kitchen: CookingPot,
  bathroom: Bath,
  toilet: Toilet,
  hallway: DoorOpen,
  office: BriefcaseBusiness,
  closet: Shirt,
  balcony: Sun,
  storage: Warehouse,
};

export function roomIcon(type: RoomType): LucideIcon {
  return ROOM_ICONS[type] ?? Package;
}
