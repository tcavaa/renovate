import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two save routes end to end, with the database and the session mocked.
 *
 * What these prove: forged prices and quantities never reach the insert, unknown products are
 * refused, guests get `draft` and users get `saved`, and the rate limiter fronts the route.
 */

const insertValues = vi.fn<(values: Record<string, unknown>) => Promise<Array<{ insertId: number }>>>(async () => [{ insertId: 42 }]);
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: insertValues }) },
}));

const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));

vi.mock('@/lib/api/rateBook', async () => {
  const { DEFAULT_RATE_BOOK } = await import('@/lib/calculator/rates');
  return { loadRateBook: async () => DEFAULT_RATE_BOOK };
});

vi.mock('@/lib/api/productPrices', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/productPrices')>();
  return {
    ...original,
    loadProductPrices: async () =>
      new Map([
        [1, { pricePerUnit: 100, nameKa: 'ლამინატი', unit: 'm2', coveragePerUnit: null }],
        [2, { pricePerUnit: 800, nameKa: 'დივანი', unit: 'piece', coveragePerUnit: null }],
        [3, { pricePerUnit: 50, nameKa: 'საღებავი', unit: 'liter', coveragePerUnit: 10 }],
      ]),
  };
});

let ipCounter = 0;
function post(url: string, body: unknown, ip = `198.51.100.${++ipCounter}`) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const room = {
  id: 'r1',
  type: 'living_room',
  nameKa: 'მისაღები',
  width: 5,
  length: 4,
  height: 2.7,
  floorM2: 20,
  wallM2: 48.6,
  ceilingM2: 20,
  perimeterM: 18,
  isWetRoom: false,
};

beforeEach(() => {
  insertValues.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('POST /api/projects', () => {
  const load = async () => (await import('@/app/api/projects/route')).POST;

  it('reprices products from the catalogue and recomputes quantities from the rooms', async () => {
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/projects', {
        homeState: 'green_frame',
        rooms: [room],
        selectedProducts: {
          laminate_global: { productId: 1, nameKa: 'x', pricePerUnit: 1, unit: 'm2', qty: 1, totalPrice: 1, imageUrl: null },
        },
        selectedFurniture: {
          r1: [{ productId: 2, nameKa: 'y', pricePerUnit: 1, unit: 'piece', qty: 50, totalPrice: 50, imageUrl: null }],
        },
      }),
      { params: {} }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(42);

    const inserted = insertValues.mock.calls[0][0] as Record<string, unknown>;
    const products = inserted.selectedProducts as Record<string, { qty: number; pricePerUnit: number; totalPrice: number }>;
    expect(products.laminate_global.qty).toBe(22); // 20 m² dry floor + 10 % waste
    expect(products.laminate_global.pricePerUnit).toBe(100);
    expect(products.laminate_global.totalPrice).toBe(2200);
    const furniture = inserted.selectedFurniture as Record<string, Array<{ qty: number; totalPrice: number }>>;
    expect(furniture.r1[0]).toMatchObject({ qty: 1, totalPrice: 800 });
    expect(inserted.status).toBe('draft');
    expect(body.data.summary.subtotalFurniture).toBe(800);
  });

  it('refuses a product the catalogue does not know', async () => {
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/projects', {
        homeState: 'green_frame',
        rooms: [room],
        selectedProducts: { paint_global: { productId: 999, nameKa: 'x', pricePerUnit: 1, unit: 'liter', qty: 1, totalPrice: 1, imageUrl: null } },
        selectedFurniture: {},
      }),
      { params: {} }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('999');
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('rejects an invalid body with 400', async () => {
    const POST = await load();
    const res = await POST(post('http://localhost/api/projects', { homeState: 'purple' }), { params: {} });
    expect(res.status).toBe(400);
  });

  it('marks a signed-in user’s project as saved and attaches the user id', async () => {
    authMock.mockResolvedValue({ user: { id: '5', role: 'user' } });
    const POST = await load();
    await POST(post('http://localhost/api/projects', { homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {} }), { params: {} });
    expect(insertValues.mock.calls[0][0]).toMatchObject({ userId: 5, status: 'saved' });
  });

  it('throttles repeated saves from one address', async () => {
    const POST = await load();
    const ip = '198.51.100.250';
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const res = await POST(post('http://localhost/api/projects', { homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {} }, ip), { params: {} });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('POST /api/design/projects', () => {
  const load = async () => (await import('@/app/api/design/projects/route')).POST;

  const plan = {
    rooms: [
      {
        id: 'living',
        type: 'living_room',
        name: 'მისაღები',
        polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }],
        heightM: 2.7,
        areaM2: 20,
        perimeterM: 18,
        openings: [],
      },
    ],
    metresPerPixel: null,
    bounds: { width: 5, depth: 4 },
    source: 'manual',
    wallThicknessM: 0.12,
  };
  const snapshot = (productId: number, qty: number) => ({
    productId,
    nameKa: 'x',
    slug: 'x',
    brand: null,
    pricePerUnit: 1,
    unit: 'piece',
    qty,
    totalPrice: 1,
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dUrl: '/models/x.glb',
    categorySlug: 'sofas',
    store: null,
  });

  it('reprices furniture per slot and finishes per square metre of the room', async () => {
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/design/projects', {
        plan,
        scene: {
          styleId: 'scandinavian',
          mode: 'design_only',
          budgetGel: null,
          items: [
            { id: 'i1', roomId: 'living', slot: 'sofa', kind: 'sofa_3seat', position: { x: 1, z: 1 }, elevationM: 0, rotation: 0, size: { width: 2, depth: 0.9, height: 0.8 }, product: snapshot(2, 40) },
          ],
          finishes: [
            { roomId: 'living', surface: 'floor', colorHex: '#ffffff', textureUrl: null, textureScaleM: 1, product: snapshot(3, 1) },
          ],
        },
      }),
      { params: {} }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cost.furnitureTotal).toBe(800); // qty forced back to 1
    expect(body.data.cost.finishesTotal).toBe(100); // 20 m² × (50 GEL / 10 m² per litre)
    const inserted = insertValues.mock.calls[0][0] as { scene: { finishes: Array<{ product: { unit: string; qty: number } }> } };
    expect(inserted.scene.finishes[0].product).toMatchObject({ unit: 'm2', qty: 20 });
  });

  it('refuses a finish for a room that is not on the plan', async () => {
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/design/projects', {
        plan,
        scene: {
          styleId: 'scandinavian',
          mode: 'design_only',
          budgetGel: null,
          items: [],
          finishes: [{ roomId: 'ghost', surface: 'floor', colorHex: '#ffffff', textureUrl: null, textureScaleM: 1, product: snapshot(3, 1) }],
        },
      }),
      { params: {} }
    );
    expect(res.status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
  });
});
