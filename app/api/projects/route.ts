import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, rates } from '@/lib/db/schema';
import { saveProjectSchema } from '@/lib/validations/project.schema';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { rateBookFromRows } from '@/lib/calculator/rates';
import type { SelectedProduct } from '@/lib/calculator/types';
import { auth } from '@/auth';
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
    const limited = rateLimited(req, RATE_RULES.saveProject);
    if (limited) return limited;

    const body = await req.json();
    const parsed = saveProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }

    const { rooms, homeState, nameKa } = parsed.data;

    // The client's prices are a preview. Every snapshot is repriced from the catalogue, so a
    // number edited in devtools never reaches the database or the admin dashboard.
    const incomingProducts = parsed.data.selectedProducts as Record<string, SelectedProduct>;
    const incomingFurniture = parsed.data.selectedFurniture as Record<string, SelectedProduct[]>;
    const known = await loadProductPrices([
      ...Object.values(incomingProducts).map((p) => p.productId),
      ...Object.values(incomingFurniture).flat().map((p) => p.productId),
    ]);

    const selectedProducts: Record<string, SelectedProduct> = {};
    for (const [key, snapshot] of Object.entries(incomingProducts)) {
      const repriced = repriceSnapshot(snapshot, known);
      if (!repriced) return unknownProduct(snapshot.productId);
      selectedProducts[key] = repriced;
    }
    const selectedFurniture: Record<string, SelectedProduct[]> = {};
    for (const [roomId, list] of Object.entries(incomingFurniture)) {
      const repricedList: SelectedProduct[] = [];
      for (const snapshot of list) {
        const repriced = repriceSnapshot(snapshot, known);
        if (!repriced) return unknownProduct(snapshot.productId);
        repricedList.push(repriced);
      }
      selectedFurniture[roomId] = repricedList;
    }

    // Same rate book the calculator UI used, so the saved total matches what was shown.
    const book = rateBookFromRows(await db.select().from(rates));
    const summary = buildProjectSummary(
      rooms,
      homeState,
      Object.values(selectedProducts),
      Object.values(selectedFurniture).flat(),
      book
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

function unknownProduct(productId: number) {
  return NextResponse.json(
    { data: null, error: `Unknown product ${productId}` },
    { status: 400 }
  );
}
