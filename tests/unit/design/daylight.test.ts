import { describe, expect, it } from 'vitest';
import { DAYLIGHT_HOURS, lightingForHour, mixHex, sunElevation } from '@/lib/design3d/daylight';
import { STYLES } from '@/lib/design/styles';

const style = STYLES.scandinavian;

describe('sunElevation', () => {
  it('is zero at night and peaks at midday', () => {
    expect(sunElevation(23)).toBe(0);
    expect(sunElevation(3)).toBe(0);
    expect(sunElevation(13)).toBeCloseTo(1, 1);
    expect(sunElevation(8)).toBeGreaterThan(0);
    expect(sunElevation(8)).toBeLessThan(sunElevation(13));
  });
});

describe('lightingForHour', () => {
  it('turns the flat’s own lights on at night and off at midday', () => {
    expect(lightingForHour(DAYLIGHT_HOURS.night, style).interiorLightsOn).toBe(true);
    expect(lightingForHour(DAYLIGHT_HOURS.noon, style).interiorLightsOn).toBe(false);
  });

  it('gives a low, warm sun in the morning and the style’s sun at noon', () => {
    const morning = lightingForHour(DAYLIGHT_HOURS.morning, style);
    const noon = lightingForHour(DAYLIGHT_HOURS.noon, style);
    expect(morning.sunPosition[1]).toBeLessThan(noon.sunPosition[1]);
    expect(morning.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(noon.sunColor.toLowerCase()).toBe(style.lighting.sun.toLowerCase());
  });

  it('moves the sun across the sky between morning and evening', () => {
    const morning = lightingForHour(DAYLIGHT_HOURS.morning, style);
    const evening = lightingForHour(DAYLIGHT_HOURS.evening, style);
    expect(Math.sign(morning.sunPosition[0])).not.toBe(Math.sign(evening.sunPosition[0]));
  });

  it('is darker at night than by day', () => {
    const night = lightingForHour(DAYLIGHT_HOURS.night, style);
    const noon = lightingForHour(DAYLIGHT_HOURS.noon, style);
    expect(night.exposure).toBeLessThan(noon.exposure);
    expect(night.hemisphereIntensity).toBeLessThan(noon.hemisphereIntensity);
    expect(night.daylight).toBe(0);
  });
});

describe('mixHex', () => {
  it('blends endpoints and midpoints', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
