import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateScene, reviewedScene, type GeneratedScene } from '@/lib/design/generateScene';
import type { AiProposal } from '@/lib/design/aiProposal';
import type { DesignStoreHook } from '@/store/designStore';
import { GENERATION_CATALOG, generationPlan, generationProposal } from '../../helpers/generation';

/**
 * Laying the flat out as one pure function (`lib/design/generateScene`): the browser's store and
 * the server's generation job (`lib/api/designJob`) must make the same flat from the same seed —
 * the job is the store's generation run on the server.
 */

let useDesignStore: DesignStoreHook;

beforeAll(async () => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  });
  ({ useDesignStore } = await import('@/store/designStore'));
});

/** The flat with the time it was made left out (the store stamps its own), and the fittings without their ids (made from the clock). */
const flat = (scene: Pick<GeneratedScene, 'plan' | 'items' | 'finishes' | 'decor' | 'electrical' | 'generation'>) => ({
  plan: scene.plan,
  items: scene.items,
  finishes: scene.finishes,
  decor: scene.decor,
  electrical: scene.electrical.map(({ id: _id, ...point }) => point),
  generation: { ...scene.generation, at: '' },
});

function generateLike(seed: number, proposal: AiProposal | null) {
  return generateScene({
    plan: generationPlan(),
    styleId: 'modern',
    budgetGel: null,
    catalog: GENERATION_CATALOG,
    proposal,
    finishes: [],
    electrical: [],
    seed,
    at: '2026-10-21T00:00:00.000Z',
    aiCount: proposal ? 1 : 0,
  });
}

describe('generateScene', () => {
  it('lays out the flat the store lays out for the same seed, with the designer and without', () => {
    for (const proposal of [generationProposal(), null]) {
      useDesignStore.getState().reset();
      useDesignStore.setState({ plan: generationPlan(), styleId: 'modern', budgetGel: null });
      const before = useDesignStore.getState();
      before.generate(GENERATION_CATALOG, proposal, 4242);
      const stored = useDesignStore.getState();
      const server = generateScene({
        plan: before.plan!,
        styleId: 'modern',
        budgetGel: null,
        catalog: GENERATION_CATALOG,
        proposal,
        finishes: before.finishes,
        electrical: before.electrical,
        calculatorPicks: before.calculatorPicks,
        seed: 4242,
        at: 'now',
        aiCount: (before.generation?.aiCount ?? 0) + (proposal ? 1 : 0),
      });
      expect(flat({ plan: stored.plan!, items: stored.items, finishes: stored.finishes, decor: stored.decor, electrical: stored.electrical, generation: stored.generation! })).toEqual(flat(server));
      expect(stored.generated).toBe(true);
    }
  });

  it('furnishes the flat as the designer proposed: its picks, its decor, its notes', () => {
    const laid = generateLike(7, generationProposal());
    const bed = laid.items.find((i) => i.kind === 'bed_double');
    expect(bed?.product?.productId).toBe(102);
    expect(laid.items.find((i) => i.kind === 'sofa_corner')?.product?.productId).toBe(124);
    expect(laid.decor.some((d) => d.family === 'slats' && d.roomId === 'bed')).toBe(true);
    expect(laid.generation).toMatchObject({ by: 'ai', model: 'claude-test', aiCount: 1, notes: { bed: 'A calm bedroom.' } });
    // Every room's floor and walls are products the budget can buy.
    expect(laid.finishes.filter((f) => f.surface === 'floor' && f.product).map((f) => f.roomId).sort()).toEqual(['bed', 'living']);
  });

  it('is the same flat for one seed and the engine’s own without a proposal', () => {
    expect(flat(generateLike(11, generationProposal()))).toEqual(flat(generateLike(11, generationProposal())));
    const engine = generateLike(11, null);
    expect(engine.decor).toEqual([]);
    expect(engine.generation).toMatchObject({ by: 'engine', aiCount: 0 });
    expect(engine.items.length).toBeGreaterThan(0);
    const layouts = new Set(Array.from({ length: 8 }, (_, seed) => JSON.stringify(generateLike(seed, null).items.map((i) => [i.kind, i.position, i.product?.productId]))));
    expect(layouts.size).toBeGreaterThan(1);
  });
});

describe('reviewedScene', () => {
  it('applies the check’s fixes and puts its note after the designer’s', () => {
    const laid = generateLike(7, generationProposal());
    const nightstand = laid.items.find((i) => i.kind === 'nightstand')!;
    const checked = reviewedScene(
      { plan: laid.plan, items: laid.items, decor: laid.decor, generation: laid.generation },
      { model: 'claude-test', fixes: [{ target: nightstand.id, action: 'remove', productId: null, wallIndex: null, reason: 'In the way.' }], notes: { bed: 'Checked.' } },
      GENERATION_CATALOG
    );
    expect(checked.items.some((i) => i.id === nightstand.id)).toBe(false);
    expect(checked.generation).toMatchObject({ reviewed: 1, notes: { bed: 'A calm bedroom. Checked.', living: 'A bright living room.' } });
  });
});
