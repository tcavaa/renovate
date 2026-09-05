import { NextResponse } from 'next/server';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, rates } from '@/lib/db/schema';
import { auth } from '@/auth';
import { saveDesignSchema } from '@/lib/validations/design.schema';
import { planToCalculatorRooms, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { priceScene } from '@/lib/design/pricing';
import { rateBookFromRows } from '@/lib/calculator/rates';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { loadProductPrices, repriceSnapshot } from '@/lib/api/productPrices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ data: [], error: null });
    }

    const rows = await db
      .select()
      .from(projects)
      // Only design-studio projects — the calculator has its own list.
      .where(and(eq(projects.userId, Number(session.user.id)), isNotNull(projects.plan)))
      .orderBy(desc(projects.createdAt));

    return NextResponse.json({ data: rows, error: null });
  } catch (e) {
    console.error('GET /api/design/projects', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load designs' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const limited = rateLimited(req, RATE_RULES.saveProject);
    if (limited) return limited;

    const body = await req.json();
    const parsed = saveDesignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }

    const { nameKa, homeState, floorPlanUrl } = parsed.data;
    const plan = parsed.data.plan as FloorPlan;
    const submitted = parsed.data.scene as DesignScene;

    // The client's prices are a preview. Every product snapshot in the scene is repriced
    // from the catalogue before anything is summed or stored, so a figure edited in devtools
    // never becomes the record the admin dashboard shows.
    const known = await loadProductPrices([
      ...submitted.items.map((i) => i.product?.productId),
      ...submitted.finishes.map((f) => f.product?.productId),
    ].filter((id): id is number => typeof id === 'number'));

    const scene: DesignScene = { ...submitted, items: [], finishes: [] };
    for (const item of submitted.items) {
      if (!item.product) {
        scene.items.push(item);
        continue;
      }
      const product = repriceSnapshot(item.product, known);
      if (!product) return unknownProduct(item.product.productId);
      scene.items.push({ ...item, product });
    }
    for (const finish of submitted.finishes) {
      if (!finish.product) {
        scene.finishes.push(finish);
        continue;
      }
      const product = repriceSnapshot(finish.product, known);
      if (!product) return unknownProduct(finish.product.productId);
      scene.finishes.push({ ...finish, product });
    }

    // Same rate book the studio's cost bar used, so a `full`-mode save matches the preview.
    const book = rateBookFromRows(await db.select().from(rates));
    const cost = priceScene(plan, scene, { homeState, book });
    const rooms = planToCalculatorRooms(plan);

    const session = await auth();
    const userId = session?.user?.id ? Number(session.user.id) : null;

    const inserted = await db.insert(projects).values({
      userId,
      sessionId: null,
      nameKa,
      homeState,
      mode: scene.mode,
      styleId: scene.styleId,
      budgetGel: scene.budgetGel != null ? String(scene.budgetGel) : null,
      floorPlanUrl: floorPlanUrl ?? plan.imageUrl ?? null,
      totalM2: String(totalFloorAreaM2(plan)),
      rooms,
      plan,
      scene,
      selectedProducts: null,
      selectedFurniture: null,
      totalMaterialsCost: String(cost.materialsTotal + cost.finishesTotal),
      totalFurnitureCost: String(cost.furnitureTotal),
      totalWorkersCost: String(cost.labourTotal),
      totalCost: String(cost.grandTotal),
      status: userId ? 'saved' : 'draft',
    });

    return NextResponse.json({
      data: { id: inserted[0].insertId, cost },
      error: null,
    });
  } catch (e) {
    console.error('POST /api/design/projects', e);
    return NextResponse.json(
      { data: null, error: 'Failed to save design' },
      { status: 500 }
    );
  }
}

function unknownProduct(productId: number) {
  return NextResponse.json(
    { data: null, error: `Unknown product ${productId}` },
    { status: 400 }
  );
}
