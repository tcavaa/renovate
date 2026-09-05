import { NextResponse } from 'next/server';
import { calculatorRequestSchema } from '@/lib/validations/room.schema';
import {
  calculateMaterials,
  calculateWorkerCosts,
  aggregateRoomTotals,
} from '@/lib/calculator/materials';
import { rateBookFromRows } from '@/lib/calculator/rates';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = calculatorRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const { rooms, homeState } = parsed.data;
    const book = rateBookFromRows(await db.select().from(rates));
    const materials = calculateMaterials(rooms, homeState, book);
    const workerCosts = calculateWorkerCosts(rooms, homeState, book);
    const totals = aggregateRoomTotals(rooms);
    return NextResponse.json({
      data: {
        materials,
        workerCosts,
        totalFloorM2: totals.totalFloorM2,
        totalWallM2: totals.totalWallM2,
        totalWetRoomM2: totals.totalWetRoomM2,
      },
      error: null,
    });
  } catch (e) {
    console.error('POST /api/calculator/materials', e);
    return NextResponse.json(
      { data: null, error: 'Calculation failed' },
      { status: 500 }
    );
  }
}
