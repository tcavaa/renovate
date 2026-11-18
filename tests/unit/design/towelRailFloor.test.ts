import { describe, expect, it } from 'vitest';
import { generatedFlat } from '../../helpers/generationAudit';
import { fixtureCatalog, fixturePlans } from '../../helpers/generationFixtures';

/**
 * The floor under a towel rail hung low is free for what stays lower than the rail (`KeepClear.bottom`),
 * but a room laid out another way for it may not lose a piece it had with the floor kept clear to the
 * ceiling (`generateScene`'s `laidOutAndMatched`).
 */
describe('a room laid out under a towel rail', () => {
  const catalog = fixtureCatalog();
  const plan = fixturePlans().find((p) => p.id === '#405')!.plan;

  it('keeps its bath where the bath laid under the rail gets no product (#405/industrial/4, r5)', () => {
    // Under the rail the bath's slot stood against the basin, and no bath of the style's fits there;
    // with the strip clear to the ceiling it is laid in the corner and #4328 stands there.
    const flat = generatedFlat('#405', plan, catalog, 'industrial', 4);
    const baths = flat.items.filter((i) => i.roomId === 'r5' && i.slot === 'bathtub' && i.product);
    expect(baths).toHaveLength(1);
  });
});
