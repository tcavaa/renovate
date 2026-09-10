/**
 * Lighting for a time of day.
 *
 * The studio's sun is a directional light whose position, colour and strength follow the
 * hour: low and warm at 8, high and white at 13, low and orange at 19, gone at 23 — when a
 * cool moon takes over outside and the flat switches its own lights on. Pure arithmetic
 * over a 24-hour clock so it can be tested without a renderer; the viewer turns the result
 * into lights and the style's own palette still tints the sun and the lamps.
 */

import type { StyleDefinition } from '@/lib/design/types';

export type DaylightPreset = 'morning' | 'noon' | 'evening' | 'night';

/** The four presets the top bar offers, as hours on the clock. */
export const DAYLIGHT_HOURS: Record<DaylightPreset, number> = {
  morning: 8,
  noon: 13,
  evening: 19,
  night: 23,
};

export const DAYLIGHT_PRESETS: DaylightPreset[] = ['morning', 'noon', 'evening', 'night'];

export interface Daylight {
  /** World position of the sun (or the moon at night), metres from the flat's centre. */
  sunPosition: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  /** Sky and ground colours of the hemisphere light. */
  skyColor: string;
  groundColor: string;
  hemisphereIntensity: number;
  /** Flat fill so nothing goes pitch black indoors. */
  ambientIntensity: number;
  /** What the canvas clears to, and the fog colour. */
  background: string;
  /** Renderer exposure: a little over 1 by day, well under at night. */
  exposure: number;
  /** Whether the flat's own lamps are on, and how bright. */
  interiorLightsOn: boolean;
  interiorIntensity: number;
  /** 0 = deep night, 1 = full day. Handy for anything that wants to blend. */
  daylight: number;
}

const SUNRISE = 6;
const SUNSET = 20;

/** Hex → [r,g,b] in 0..1. */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hex(c: [number, number, number]): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}

/** Linear blend of two colours, `t` in 0..1 towards `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return hex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/**
 * How high the sun stands at this hour, 0 (horizon or below) to 1 (noon). A half-sine
 * between sunrise and sunset; anything outside is night.
 */
export function sunElevation(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h <= SUNRISE || h >= SUNSET) return 0;
  return Math.sin(((h - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI);
}

export function lightingForHour(hour: number, style: StyleDefinition): Daylight {
  const elevation = sunElevation(hour);
  const h = ((hour % 24) + 24) % 24;
  // The sun travels east (−x) → west (+x) over the day, always somewhat to the south (+z)
  // of the flat, so morning and evening light come through different windows.
  const progress = Math.max(0, Math.min(1, (h - SUNRISE) / (SUNSET - SUNRISE)));
  const azimuth = Math.PI * (1 - progress);
  const distance = 26;
  const altitude = Math.max(0.12, elevation);
  const horizontal = distance * Math.cos(altitude * Math.PI * 0.45);
  const sunPosition: [number, number, number] = [
    Math.cos(azimuth) * horizontal,
    Math.sin(altitude * Math.PI * 0.45) * distance + 3,
    Math.abs(Math.sin(azimuth)) * horizontal * 0.6 + 6,
  ];

  if (elevation <= 0) {
    // Night: a cool, weak moon outside, the lamps carrying the room inside.
    return {
      sunPosition: [-10, 14, -12],
      sunColor: '#8FA3C7',
      sunIntensity: 0.22,
      skyColor: '#1B2436',
      groundColor: '#0D1119',
      hemisphereIntensity: 0.28,
      ambientIntensity: 0.16,
      background: '#0F1520',
      exposure: 0.85,
      interiorLightsOn: true,
      interiorIntensity: 1,
      daylight: 0,
    };
  }

  // Low sun is warm; high sun is the style's own. Colour and strength both follow elevation.
  const lowSun = h < 13 ? '#FFC98A' : '#FF9E5C';
  const sunColor = mixHex(lowSun, style.lighting.sun, Math.min(1, elevation * 1.6));
  const sunIntensity = style.lighting.sunIntensity * (0.45 + 0.55 * elevation);
  const skyDay = style.lighting.ambient;
  const skyLow = h < 13 ? '#F4E3D3' : '#E9C7B4';
  const skyColor = mixHex(skyLow, skyDay, Math.min(1, elevation * 1.4));
  // Evenings dim faster than mornings brighten: the lamps come on before the sun is gone.
  const dusk = h >= 17 && elevation < 0.45;
  return {
    sunPosition,
    sunColor,
    sunIntensity,
    skyColor,
    groundColor: '#8A8078',
    hemisphereIntensity: style.lighting.ambientIntensity * (0.55 + 0.45 * elevation),
    ambientIntensity: 0.05 + 0.1 * (1 - elevation),
    background: mixHex(mixHex(skyLow, '#3A3F52', dusk ? 0.35 : 0), skyDay, Math.min(1, elevation * 1.4)),
    exposure: 0.95 + 0.12 * elevation,
    interiorLightsOn: dusk,
    interiorIntensity: dusk ? 0.6 : 0,
    daylight: elevation,
  };
}
