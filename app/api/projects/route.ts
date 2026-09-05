import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { saveProjectSchema } from '@/lib/validations/project.schema';
import {
  buildProjectSummary,
} from '@/lib/calculator/materials';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ data: [], error: null });
    }
    const userId = Number(session.user.id);
    const data = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt));
    return NextResponse.json({ data, error: null });
  } catch (e) {
    console.error('GET /api/projects', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load projects' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = saveProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }

    const { rooms, homeState, nameKa, selectedProducts, selectedFurniture } = parsed.data;

    const productList = Object.values(selectedProducts) as Parameters<
      typeof buildProjectSummary
    >[2];
    const furnitureList = Object.values(selectedFurniture).flat() as Parameters<
      typeof buildProjectSummary
    >[3];

    const summary = buildProjectSummary(
      rooms,
      homeState,
      productList,
      furnitureList
    );
    const totalM2 = rooms.reduce((s, r) => s + r.floorM2, 0);

    const session = await auth();
    const userId = session?.user?.id ? Number(session.user.id) : null;

    const inserted = await db.insert(projects).values({
      userId,
      sessionId: null,
      nameKa,
      homeState,
      totalM2: String(totalM2),
      rooms,
      selectedProducts,
      selectedFurniture,
      totalMaterialsCost: String(summary.subtotalMaterials + summary.subtotalProducts),
      totalFurnitureCost: String(summary.subtotalFurniture),
      totalWorkersCost: String(summary.subtotalWorkers),
      totalCost: String(summary.grandTotalWithMargin),
      status: userId ? 'saved' : 'draft',
    });

    return NextResponse.json({
      data: { id: inserted[0].insertId, summary },
      error: null,
    });
  } catch (e) {
    console.error('POST /api/projects', e);
    return NextResponse.json(
      { data: null, error: 'Failed to save project' },
      { status: 500 }
    );
  }
}
