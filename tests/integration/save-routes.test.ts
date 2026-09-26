import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The project routes end to end, with the database and the session mocked.
 *
 * What these prove: a project is made, named, before its first step, and the saves only ever
 * write into the caller's own; forged prices and quantities never reach the row; unknown
 * products are refused; a save made from an older revision than the row's is refused rather
 * than written over newer work; each half leaves the other's shared columns alone; and the
 * rate limiter fronts the saves.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  row: null as Row | null,
  /** What the conditional update matches: 0 is another save having got there first. */
  affected: 1,
  updates: [] as Row[],
  inserts: [] as Row[],
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (db.row ? [db.row] : []) }) }) }),
    update: () => ({
      set: (values: Row) => ({
        where: async () => {
          db.updates.push(values);
          if (db.affected && db.row) {
            db.row = {
              ...db.row,
              ...('calculatorRev' in values ? { calculatorRev: Number(db.row.calculatorRev) + 1 } : {}),
              ...('designRev' in values ? { designRev: Number(db.row.designRev) + 1 } : {}),
            };
          }
          return [{ affectedRows: db.affected }];
        },
      }),
    }),
    insert: () => ({
      values: async (values: Row) => {
        db.inserts.push(values);
        return [{ insertId: 42 }];
      },
    }),
  },
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
        [4, { pricePerUnit: 620, nameKa: 'კარი', unit: 'piece', coveragePerUnit: null }],
        [5, { pricePerUnit: 30, nameKa: 'როზეტი', unit: 'piece', coveragePerUnit: null }],
        [6, { pricePerUnit: 38, nameKa: 'რადიატორი (1 სექცია)', unit: 'piece', coveragePerUnit: null }],
      ]),
  };
});

let ipCounter = 0;
function request(method: string, url: string, body: unknown, ip = `198.51.100.${++ipCounter}`) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}
const post = (url: string, body: unknown, ip?: string) => request('POST', url, body, ip);
const ctx = { params: Promise.resolve({}) };

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

/** The caller's project as the row stands before the save. */
const own = (patch: Row = {}): Row => ({ id: 42, userId: 5, status: 'draft', homeState: null, plan: null, scene: null, selectedProducts: {}, selectedFurniture: {}, calculatorEdits: { progress: { step: 1, calculated: false } }, calculatorRev: 0, designRev: 0, mode: 'full', ...patch });
const signedIn = () => authMock.mockResolvedValue({ user: { id: '5', role: 'user' } });
const lastUpdate = () => db.updates[db.updates.length - 1];

beforeEach(() => {
  db.row = own();
  db.affected = 1;
  db.updates.length = 0;
  db.inserts.length = 0;
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('POST /api/projects (the calculation)', () => {
  const load = async () => (await import('@/app/api/projects/route')).POST;
  const worked = { progress: { step: 3, calculated: true } };

  it('needs somebody signed in, and a project of theirs', async () => {
    const POST = await load();
    const body = { projectId: 42, homeState: null, rooms: [], selectedProducts: {}, selectedFurniture: {}, edits: { progress: { step: 1, calculated: false } }, draft: true };
    expect((await POST(post('http://localhost/api/projects', body), ctx)).status).toBe(401);
    signedIn();
    db.row = null;
    expect((await POST(post('http://localhost/api/projects', body), ctx)).status).toBe(404);
    expect(db.updates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  it('saves a calculation still on its first step — no home state, no rooms — with its board and no totals', async () => {
    signedIn();
    const POST = await load();
    const board = { plan: null, floorPlanUrl: '/uploads/plans/p.png', finishes: [] };
    const res = await POST(post('http://localhost/api/projects', { projectId: 42, homeState: null, rooms: [], selectedProducts: {}, selectedFurniture: {}, edits: { progress: { step: 1, calculated: false, at: 1 } }, board, draft: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 42, rev: 1 });
    const set = lastUpdate();
    expect(set).toMatchObject({ totalCost: null, rooms: [], calculatorBoard: board, calculatorEdits: { progress: { step: 1, calculated: false, at: 1 } } });
    // Nothing else in the row needs it: a calculation on its own writes its home state as it is.
    expect(set.homeState).toBeNull();
  });

  it('never blanks a design’s home state or rooms with a calculation that has none yet', async () => {
    signedIn();
    db.row = own({ homeState: 'white_frame', plan: { rooms: [{ id: 'd' }] }, scene: { mode: 'full', progress: { step: 5, generated: true } }, rooms: [room] });
    const POST = await load();
    await POST(post('http://localhost/api/projects', { projectId: 42, homeState: null, rooms: [], selectedProducts: {}, selectedFurniture: {}, edits: { progress: { step: 1, calculated: false } }, draft: true }), ctx);
    const set = lastUpdate();
    expect('homeState' in set).toBe(false);
    expect('rooms' in set).toBe(false);
    expect('totalM2' in set).toBe(false);
  });

  it('refuses a worked-out calculation without a home state or rooms', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(post('http://localhost/api/projects', { projectId: 42, homeState: null, rooms: [], selectedProducts: {}, selectedFurniture: {}, edits: worked }), ctx);
    expect(res.status).toBe(400);
  });

  it('reprices products from the catalogue, recomputes quantities from the rooms, and confirms a draft on "save"', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/projects', {
        projectId: 42,
        homeState: 'green_frame',
        rooms: [room],
        selectedProducts: { laminate_global: { productId: 1, nameKa: 'x', pricePerUnit: 1, unit: 'm2', qty: 1, totalPrice: 1, imageUrl: null } },
        selectedFurniture: { r1: [{ productId: 2, nameKa: 'y', pricePerUnit: 1, unit: 'piece', qty: 50, totalPrice: 50, imageUrl: null }] },
        edits: worked,
        draft: false,
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.subtotalFurniture).toBe(800);
    const set = lastUpdate();
    const products = set.selectedProducts as Record<string, { qty: number; pricePerUnit: number; totalPrice: number }>;
    expect(products.laminate_global).toMatchObject({ qty: 22, pricePerUnit: 100, totalPrice: 2200 }); // 20 m² dry floor + 10 % waste
    expect((set.selectedFurniture as Record<string, Array<{ qty: number; totalPrice: number }>>).r1[0]).toMatchObject({ qty: 1, totalPrice: 800 });
    expect(set).toMatchObject({ homeState: 'green_frame', mode: 'full', status: 'saved' });
    expect(Number(set.totalCost)).toBeGreaterThan(0);
  });

  it('counts a room’s floor and walls from that room — as the catalogue step shows them — in the catalogue’s own unit', async () => {
    signedIn();
    const POST = await load();
    const pick = (productId: number, over: object) => ({ productId, nameKa: 'x', pricePerUnit: 1, unit: 'm2', qty: 999, totalPrice: 1, imageUrl: null, ...over });
    const res = await POST(
      post('http://localhost/api/projects', {
        projectId: 42,
        homeState: 'green_frame',
        rooms: [room],
        selectedProducts: {
          'laminate_room:r1': pick(1, { roomId: 'r1', surface: 'floor', categorySlug: 'laminate' }),
          // Sent in the wrong unit and as a floor: the catalogue's unit and the category's surface win.
          'paint_room:r1': pick(3, { roomId: 'r1', surface: 'floor', categorySlug: 'paint' }),
          // A room that is no longer in the flat.
          'laminate_room:gone': pick(1, { roomId: 'gone', categorySlug: 'laminate' }),
        },
        selectedFurniture: {},
        edits: worked,
        draft: true,
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const products = lastUpdate().selectedProducts as Record<string, { qty: number; unit: string; totalPrice: number; roomId?: string; surface?: string }>;
    expect(Object.keys(products).sort()).toEqual(['laminate_room:r1', 'paint_room:r1']);
    expect(products['laminate_room:r1']).toMatchObject({ qty: 22, totalPrice: 2200, roomId: 'r1', surface: 'floor' }); // 20 m² + 10 % waste
    expect(products['paint_room:r1']).toMatchObject({ qty: 5, unit: 'liter', totalPrice: 250, roomId: 'r1', surface: 'wall' }); // 48.6 m² at 10 m² a litre
  });

  it('turns a design in the row into a renovation in place, and counts it as a write to the design', async () => {
    signedIn();
    db.row = own({ plan: { rooms: [{ id: 'd' }] }, scene: { mode: 'design_only', progress: { step: 5, generated: true } }, mode: 'design_only' });
    const POST = await load();
    await POST(post('http://localhost/api/projects', { projectId: 42, homeState: 'black_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, draft: true }), ctx);
    const set = lastUpdate();
    expect(set.mode).toBe('full');
    expect('scene' in set).toBe(true);
    expect('designRev' in set).toBe(true);
  });

  it('refuses a save made from an older revision than the row’s, unless the person chose to keep theirs', async () => {
    signedIn();
    db.row = own({ calculatorRev: 4 });
    const POST = await load();
    const body = { projectId: 42, baseRev: 3, homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, draft: true };
    const stale = await POST(post('http://localhost/api/projects', body), ctx);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe('PROJECT_CHANGED');
    expect(db.updates).toHaveLength(0);
    const forced = await POST(post('http://localhost/api/projects', { ...body, force: true }), ctx);
    expect(forced.status).toBe(200);
    expect((await forced.json()).data.rev).toBe(5);
  });

  it('takes a save that follows this browser’s own write whose answer never came back', async () => {
    signedIn();
    // The last write (id "w1") landed and moved the row to 4, but its answer was lost: the browser still says 3.
    db.row = own({ calculatorRev: 4, calculatorSaveId: 'w1' });
    const POST = await load();
    const body = { projectId: 42, baseRev: 3, prevSaveId: 'w1', saveId: 'w2', homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, draft: true };
    const res = await POST(post('http://localhost/api/projects', body), ctx);
    expect(res.status).toBe(200);
    expect(lastUpdate().calculatorSaveId).toBe('w2');
    // Somebody else's write in between is still a conflict.
    db.row = own({ calculatorRev: 4, calculatorSaveId: 'other' });
    expect((await POST(post('http://localhost/api/projects', body), ctx)).status).toBe(409);
  });

  it('refuses the loser of two saves racing each other, forced or not', async () => {
    signedIn();
    db.affected = 0;
    const POST = await load();
    const res = await POST(post('http://localhost/api/projects', { projectId: 42, baseRev: 0, homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, draft: true }), ctx);
    expect(res.status).toBe(409);
    const forced = await POST(post('http://localhost/api/projects', { projectId: 42, baseRev: 0, force: true, homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, draft: true }), ctx);
    expect(forced.status).toBe(409);
  });

  it('refuses a product the catalogue does not know', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/projects', {
        projectId: 42,
        homeState: 'green_frame',
        rooms: [room],
        selectedProducts: { paint_global: { productId: 999, nameKa: 'x', pricePerUnit: 1, unit: 'liter', qty: 1, totalPrice: 1, imageUrl: null } },
        selectedFurniture: {},
        edits: worked,
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('999');
    expect(db.updates).toHaveLength(0);
  });

  it('rejects an invalid body with 400', async () => {
    const POST = await load();
    expect((await POST(post('http://localhost/api/projects', { homeState: 'purple' }), ctx)).status).toBe(400);
  });

  it('saves an old renovation with the strip-out in its labour', async () => {
    signedIn();
    const POST = await load();
    const save = (homeState: string) => POST(post('http://localhost/api/projects', { projectId: 42, homeState, rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, force: true }), ctx);
    const res = await save('old_renovation');
    expect(res.status).toBe(200);
    const old = lastUpdate();
    const keys = ((await res.json()).data.summary.workerCosts as Array<{ key: string }>).map((w) => w.key);
    // A dry room has no tiles to break out.
    expect(keys.slice(0, 3)).toEqual(['demolish_floor', 'demolish_walls', 'debris_old']);
    // The same flat as a black frame: no floor or walls to break up and a new build's rubbish
    // (5 ₾/m²) instead of an old renovation's (40 ₾/m²).
    await save('black_frame');
    const black = lastUpdate();
    const stripOut = 20 * 15 + 48.6 * 20 + 20 * 40 - 20 * 5;
    expect(Number(old.totalWorkersCost) - Number(black.totalWorkersCost)).toBeCloseTo(stripOut, 2);
  });

  it('throttles repeated saves from one address', async () => {
    signedIn();
    const POST = await load();
    const ip = '198.51.100.250';
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const res = await POST(post('http://localhost/api/projects', { projectId: 42, homeState: 'green_frame', rooms: [room], selectedProducts: {}, selectedFurniture: {}, edits: worked, force: true }, ip), ctx);
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('POST /api/design/projects (the design)', () => {
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
  const snapshot = (productId: number, qty: number) => ({ productId, nameKa: 'x', slug: 'x', brand: null, pricePerUnit: 1, unit: 'piece', qty, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/x.glb', categorySlug: 'sofas', store: null });
  const designRow = (patch: Row = {}) => own({ selectedProducts: null, selectedFurniture: null, calculatorEdits: null, mode: 'design_only', plan: { rooms: [] }, scene: { progress: { step: 1, generated: false } }, ...patch });

  beforeEach(() => {
    db.row = designRow();
  });

  it('needs somebody signed in, and a project of theirs', async () => {
    const POST = await load();
    const body = { projectId: 42, plan, scene: { styleId: 'scandinavian', mode: 'design_only', budgetGel: null, items: [], finishes: [] } };
    expect((await POST(post('http://localhost/api/design/projects', body), ctx)).status).toBe(401);
    signedIn();
    db.row = null;
    expect((await POST(post('http://localhost/api/design/projects', body), ctx)).status).toBe(404);
  });

  it('saves a blank sheet — the design’s first step — and step 1’s answers with it', async () => {
    signedIn();
    const POST = await load();
    const blank = { ...plan, rooms: [], walls: [] };
    const progress = { step: 1, generated: false, at: 1, modeChosen: true, emptyStart: false };
    const res = await POST(post('http://localhost/api/design/projects', { projectId: 42, homeState: null, plan: blank, scene: { styleId: 'scandinavian', mode: 'design_only', budgetGel: null, items: [], finishes: [], progress }, draft: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 42, rev: 1 });
    expect(lastUpdate()).toMatchObject({ homeState: null, rooms: [], totalCost: null, scene: { progress } });
  });

  it('stores no totals for a design autosaved before it was generated', async () => {
    signedIn();
    const POST = await load();
    const scene = (generated: boolean) => ({ styleId: 'scandinavian', mode: 'full', budgetGel: null, items: [], finishes: [], progress: { step: 4, generated } });
    const save = (generated: boolean) => POST(post('http://localhost/api/design/projects', { projectId: 42, plan, homeState: 'black_frame', scene: scene(generated), draft: true, force: true }), ctx);
    expect((await save(false)).status).toBe(200);
    expect(lastUpdate()).toMatchObject({ totalCost: null, totalMaterialsCost: null, homeState: 'black_frame' });
    // A renovation priced before generation would be the works alone; once generated it is the budget.
    expect((await save(true)).status).toBe(200);
    expect(Number(lastUpdate().totalCost)).toBeGreaterThan(0);
  });

  it('leaves the calculation’s home state, rooms and renovation alone once the project has one', async () => {
    signedIn();
    db.row = designRow({ selectedProducts: {}, calculatorEdits: { progress: { step: 7, calculated: true } }, homeState: 'black_frame', mode: 'full', rooms: [room] });
    const POST = await load();
    await POST(post('http://localhost/api/design/projects', { projectId: 42, plan, homeState: null, scene: { styleId: 'scandinavian', mode: 'design_only', budgetGel: null, items: [], finishes: [], progress: { step: 5, generated: true } } }), ctx);
    const set = lastUpdate();
    for (const key of ['homeState', 'rooms', 'totalM2', 'mode']) expect(key in set).toBe(false);
    expect((set.scene as { mode: string }).mode).toBe('full');
  });

  it('reprices furniture per slot and finishes per square metre of the room', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/design/projects', {
        projectId: 42,
        plan,
        scene: {
          styleId: 'scandinavian',
          mode: 'design_only',
          budgetGel: null,
          items: [{ id: 'i1', roomId: 'living', slot: 'sofa', kind: 'sofa_3seat', position: { x: 1, z: 1 }, elevationM: 0, rotation: 0, size: { width: 2, depth: 0.9, height: 0.8 }, product: snapshot(2, 40) }],
          finishes: [{ roomId: 'living', surface: 'floor', colorHex: '#ffffff', textureUrl: null, textureScaleM: 1, product: snapshot(3, 1) }],
        },
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cost.furnitureTotal).toBe(800); // qty forced back to 1
    expect(body.data.cost.finishesTotal).toBe(100); // 20 m² × (50 GEL / 10 m² per litre)
    const set = lastUpdate() as { scene: { finishes: Array<{ product: { unit: string; qty: number } }> } };
    expect(set.scene.finishes[0].product).toMatchObject({ unit: 'm2', qty: 20 });
  });

  it('buys the style’s walls in a renovation only where the strip painted over them does not lie', async () => {
    signedIn();
    const POST = await load();
    const wall = { roomId: 'living', surface: 'wall', colorHex: '#ffffff', textureUrl: null, textureScaleM: 1 };
    const res = await POST(
      post('http://localhost/api/design/projects', {
        projectId: 42,
        plan,
        homeState: 'white_frame',
        scene: {
          styleId: 'scandinavian',
          mode: 'full',
          budgetGel: null,
          items: [],
          progress: { step: 5, generated: true },
          // The style's own paint on every wall, and a metre-wide strip of something else over one.
          finishes: [
            { ...wall, product: snapshot(3, 1), origin: 'style' },
            { ...wall, wallIndex: 0, span: { from: 0, to: 1 }, product: snapshot(1, 1), origin: 'studio' },
          ],
        },
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const { cost } = (await res.json()).data;
    // 48.6 m² of wall: 2.7 m² under the strip at 100 GEL, the other 45.9 m² in paint at 5 GEL (50 GEL a litre, 10 m² a litre).
    const finishLines = cost.lines.filter((l: { section: string }) => l.section === 'finishes').map((l: { key: string; qty: number; total: number }) => [l.key, l.qty, l.total]);
    expect(finishLines).toEqual([
      ['product-3', 45.9, 229.5],
      ['product-1', 2.7, 270],
    ]);
    expect(cost.finishesTotal).toBe(499.5);
    // What is stored is what each finish covers; the budget is what shows.
    const set = lastUpdate() as { scene: { finishes: Array<{ product: { qty: number } }> } };
    expect(set.scene.finishes.map((f) => f.product.qty)).toEqual([48.6, 2.7]);
  });

  // A door, a socket and a radiator are order lines a store is sent, exactly as a sofa is —
  // so their snapshots are no more to be trusted than a sofa's.
  const fittedPlan = (doorId: number) => ({
    ...plan,
    rooms: [{ ...plan.rooms[0], openings: [{ id: 'd1', kind: 'door', wallIndex: 0, t: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0, roomId: 'living', exterior: true, origin: 'user', product: snapshot(doorId, 7) }] }],
    technical: { points: [{ id: 't1', kind: 'radiator', roomId: 'living', position: { x: 2, z: 0.1 }, origin: 'user', sections: 8, product: snapshot(6, 1) }] },
  });
  const fittedScene = {
    styleId: 'scandinavian',
    mode: 'design_only',
    budgetGel: null,
    items: [],
    finishes: [],
    electrical: [{ id: 's1', roomId: 'living', kind: 'socket_double', position: { x: 1, z: 0.01 }, elevationM: 0.45, wallIndex: 0, t: 0.2, count: 2, origin: 'user', product: snapshot(5, 99) }],
  };

  it('reprices doors, fittings and radiators too: a door apiece, a double socket as two, a radiator by its sections', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(post('http://localhost/api/design/projects', { projectId: 42, plan: fittedPlan(4), scene: fittedScene }), ctx);
    expect(res.status).toBe(200);
    const set = lastUpdate() as {
      plan: { rooms: Array<{ openings: Array<{ product: Record<string, number> }> }>; technical: { points: Array<{ product: Record<string, number> }> } };
      scene: { electrical: Array<{ product: Record<string, number> }> };
    };
    expect(set.plan.rooms[0].openings[0].product).toMatchObject({ pricePerUnit: 620, qty: 1, totalPrice: 620 });
    expect(set.scene.electrical[0].product).toMatchObject({ pricePerUnit: 30, qty: 2, totalPrice: 60 });
    expect(set.plan.technical.points[0].product).toMatchObject({ pricePerUnit: 38, qty: 8, totalPrice: 304 });
    const { cost } = (await res.json()).data;
    expect(cost.openingsTotal).toBe(620);
    expect(cost.lines.find((l: { key: string }) => l.key === 'product-5')).toMatchObject({ qty: 2, total: 60 });
    expect(cost.lines.find((l: { key: string }) => l.key === 'product-6')).toMatchObject({ qty: 8, total: 304 });
  });

  it('refuses a door the catalogue does not know', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(post('http://localhost/api/design/projects', { projectId: 42, plan: fittedPlan(999), scene: fittedScene }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('999');
    expect(db.updates).toHaveLength(0);
  });

  it('refuses a finish for a room that is not on the plan', async () => {
    signedIn();
    const POST = await load();
    const res = await POST(
      post('http://localhost/api/design/projects', {
        projectId: 42,
        plan,
        scene: { styleId: 'scandinavian', mode: 'design_only', budgetGel: null, items: [], finishes: [{ roomId: 'ghost', surface: 'floor', colorHex: '#ffffff', textureUrl: null, textureScaleM: 1, product: snapshot(3, 1) }] },
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it('refuses a save made from an older revision than the row’s', async () => {
    signedIn();
    db.row = designRow({ designRev: 2 });
    const POST = await load();
    const res = await POST(post('http://localhost/api/design/projects', { projectId: 42, baseRev: 1, plan, scene: { styleId: 'scandinavian', mode: 'design_only', budgetGel: null, items: [], finishes: [] } }), ctx);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/projects/create and PATCH /api/projects/[id]', () => {
  const create = async () => (await import('@/app/api/projects/create/route')).POST;
  const rename = async () => (await import('@/app/api/projects/[id]/route')).PATCH;

  it('makes a project only for somebody signed in, and only with a name', async () => {
    const POST = await create();
    expect((await POST(post('http://localhost/api/projects/create', { name: 'ბინა', journey: 'calculator' }), ctx)).status).toBe(401);
    signedIn();
    expect((await POST(post('http://localhost/api/projects/create', { name: '   ', journey: 'calculator' }), ctx)).status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });

  it('makes a calculation on its first step, listed in the calculator’s hub and not the design’s', async () => {
    signedIn();
    const POST = await create();
    const res = await POST(post('http://localhost/api/projects/create', { name: ' ვაკის ბინა ', journey: 'calculator' }), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).data.id).toBe(42);
    expect(db.inserts[0]).toMatchObject({ userId: 5, nameKa: 'ვაკის ბინა', status: 'draft', homeState: null, rooms: [], selectedProducts: {}, mode: 'full', calculatorEdits: { progress: { step: 1, calculated: false } } });
    expect(db.inserts[0].plan).toBeUndefined();
  });

  it('makes a design on a blank sheet with step 1 unanswered, listed in the design’s hub and not the calculator’s', async () => {
    signedIn();
    const POST = await create();
    await POST(post('http://localhost/api/projects/create', { name: 'ბინა', journey: 'design' }), ctx);
    const values = db.inserts[0] as { mode: string; selectedProducts?: unknown; plan: { rooms: unknown[] }; scene: { progress: Record<string, unknown> } };
    expect(values.mode).toBe('design_only');
    expect(values.selectedProducts).toBeUndefined();
    expect(values.plan.rooms).toEqual([]);
    expect(values.scene.progress).toMatchObject({ step: 1, generated: false, modeChosen: false });
  });

  it('renames only the caller’s own project', async () => {
    signedIn();
    const PATCH = await rename();
    db.row = null;
    expect((await PATCH(request('PATCH', 'http://localhost/api/projects/42', { name: 'ახალი' }), { params: Promise.resolve({ id: '42' }) })).status).toBe(404);
    db.row = own();
    const res = await PATCH(request('PATCH', 'http://localhost/api/projects/42', { name: 'ახალი' }), { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    expect(lastUpdate()).toEqual({ nameKa: 'ახალი' });
  });
});
