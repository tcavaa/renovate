import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRoomAreas } from '@/lib/calculator/materials';
import type { SelectedProduct } from '@/lib/calculator/types';

/**
 * The calculator's own store: what a browser kept from the seven-step calculator opens in the
 * six steps it has now, and a room's floor and walls follow the room as it changes.
 */

const memory = new Map<string, string>();
let stores: typeof import('@/store/calculatorStore');

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  });
  stores = await import('@/store/calculatorStore');
});

let nextId = 700;
beforeEach(() => {
  memory.clear();
  nextId += 1;
});

describe('a copy kept in the seven-step numbering', () => {
  it('opens on the same page in the six steps: the summary is the sixth, the placement the catalogue', () => {
    const id = nextId;
    const state = { homeState: 'white_frame', rooms: [], selectedProducts: {}, selectedFurniture: {}, step: 7, at: 5, projectId: id, calculated: true };
    memory.set(`renovate-calculator:${id}`, JSON.stringify({ state, version: 3 }));
    expect(stores.useCalculatorStore.for(id).getState()).toMatchObject({ projectId: id, step: 6, at: 4, calculated: true, homeState: 'white_frame' });
  });
});

describe('a room’s floor and walls', () => {
  const laminate: SelectedProduct = { productId: 7, nameKa: 'ლამინატი', pricePerUnit: 40, unit: 'm2', qty: 0, totalPrice: 0, imageUrl: null, categorySlug: 'laminate' };
  const room = (id: string, width: number) => computeRoomAreas({ id, type: 'bedroom', nameKa: id, width, length: 3.5, height: 2.7 });

  it('are counted again when the room is resized, and go when it goes', () => {
    const store = stores.useCalculatorStore.for(nextId);
    store.setState({ rooms: [room('a', 4), room('b', 3)] });
    store.getState().setRoomFinish(['a', 'b'], 'floor', laminate);
    expect(store.getState().selectedProducts['laminate_room:a'].qty).toBe(15.4);
    store.getState().updateRoom('a', room('a', 5));
    expect(store.getState().selectedProducts['laminate_room:a'].qty).toBe(19.3);
    store.getState().removeRoom('b');
    expect(Object.keys(store.getState().selectedProducts)).toEqual(['laminate_room:a']);
  });
});
