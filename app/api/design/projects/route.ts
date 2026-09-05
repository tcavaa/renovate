import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { auth } from '@/auth';
import { saveDesignSchema } from '@/lib/validations/design.schema';
import { planToCalculatorRooms, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { priceScene } from '@/lib/design/pricing';
import type { DesignScene, FloorPlan } from '@/lib/design/types';

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
      .where(eq(projects.userId, Number(session.user.id)))
      .orderBy(desc(projects.createdAt));

    // Only design-studio projects — the calculator has its own list.
    return NextResponse.json({
      data: rows.filter((r) => r.plan != null),
      error: null,
    });
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
    const scene = parsed.data.scene as DesignScene;

    // Recomputed server-side: the client's numbers are a preview, these are the record.
    const cost = priceScene(plan, scene, { homeState });
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
