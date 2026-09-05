import { calculatorRequestSchema } from '@/lib/validations/room.schema';
import {
  calculateMaterials,
  calculateWorkerCosts,
  aggregateRoomTotals,
} from '@/lib/calculator/materials';
import { loadRateBook } from '@/lib/api/rateBook';
import { fail, handle, ok } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle('POST /api/calculator/materials', 'Calculation failed', async (req) => {
  const parsed = calculatorRequestSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { rooms, homeState } = parsed.data;
  const book = await loadRateBook();
  const totals = aggregateRoomTotals(rooms);
  return ok({
    materials: calculateMaterials(rooms, homeState, book),
    workerCosts: calculateWorkerCosts(rooms, homeState, book),
    totalFloorM2: totals.totalFloorM2,
    totalWallM2: totals.totalWallM2,
    totalWetRoomM2: totals.totalWetRoomM2,
  });
});
