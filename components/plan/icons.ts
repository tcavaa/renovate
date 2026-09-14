/**
 * One icon per technical system and per electrical kind, shared by the 2D board's toolbar,
 * the technical step's tile grid, the studio's electric tray and the inspector — so a
 * radiator looks like the same radiator wherever it is offered.
 */

import { AirVent, Cable, CircleDot, Cylinder, Droplets, Fan, Flame, Heater, Lamp, LampCeiling, LampWallUp, Lightbulb, Plug, PlugZap, Thermometer, ToggleLeft, Tv, Waves, Wifi, Zap, type LucideIcon } from 'lucide-react';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';

export const TECHNICAL_ICON: Record<TechnicalKind, LucideIcon> = {
  water_supply: Droplets,
  sewer: Waves,
  floor_drain: CircleDot,
  electrical_panel: Zap,
  gas: Flame,
  radiator: Heater,
  ac_unit: AirVent,
  extractor: Fan,
  boiler: Cylinder,
  heating_pipe: Thermometer,
};

export const ELECTRICAL_ICON: Record<ElectricalKind, LucideIcon> = {
  socket: Plug,
  socket_double: PlugZap,
  socket_high: Plug,
  socket_kitchen: Plug,
  switch: ToggleLeft,
  tv: Tv,
  internet: Wifi,
  light_ceiling: LampCeiling,
  light_wall: LampWallUp,
  light_spot: Lightbulb,
  light_strip: Cable,
  light_furniture: Lamp,
};
