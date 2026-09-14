/**
 * An icon per archetype for the furniture shelf's kind filter — a picture where the label
 * used to be, the way a game's build catalogue does it. Kinds without a good icon fall back
 * to a plain box.
 */

import { Armchair, Bath, Bed, BedSingle, BookOpen, Box, Blinds, CookingPot, DoorClosed, Flower2, Frame, Lamp, LampFloor, Monitor, Package, Refrigerator, RockingChair, ShowerHead, Sofa, Table, Table2, Toilet, Tv, UtensilsCrossed, WashingMachine, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  bed_double: Bed,
  bed_single: BedSingle,
  nightstand: Table2,
  wardrobe: DoorClosed,
  dresser: Box,
  sofa_3seat: Sofa,
  sofa_corner: Sofa,
  armchair: Armchair,
  coffee_table: Table,
  tv_unit: Tv,
  storage_shelf: BookOpen,
  bookshelf: BookOpen,
  dining_table: UtensilsCrossed,
  dining_chair: RockingChair,
  kitchen_run: CookingPot,
  kitchen_island: CookingPot,
  fridge: Refrigerator,
  desk: Monitor,
  office_chair: Armchair,
  toilet: Toilet,
  sink: Bath,
  shower: ShowerHead,
  bathtub: Bath,
  washer: WashingMachine,
  console_table: Table2,
  shoe_cabinet: Box,
  mirror: Frame,
  rug: Blinds,
  rug_bed: Blinds,
  floor_lamp: LampFloor,
  pendant: Lamp,
  plant: Flower2,
  artwork: Frame,
  curtain: Blinds,
};

export function archetypeIcon(kind: string): LucideIcon {
  return ICONS[kind] ?? Package;
}
