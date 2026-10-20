import { fail, handle, ok } from '@/lib/api/route';
import { afterResponse } from '@/lib/api/after';
import { JOB_HEADER, JOB_TOKEN_HEADER, runReviewStage, validJobToken } from '@/lib/api/designJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The designer's check of every room runs after the answer, in this function's own 300 s.
export const maxDuration = 300;

/**
 * The second half of a generation job (`lib/api/designJob`): the server's own request, made by the
 * design stage once the flat is written, signed with the job's server-only token (`jobToken`).
 * Answered at once; the designer then checks every room it furnished, its fixes are applied where
 * they fit, and the flat is written laid out (`runReviewStage`) — whether or not anyone is watching.
 * A browser never calls it.
 */
export const POST = handle('POST /api/design/ai-review', 'Failed to review', async (req) => {
  const jobId = Number(req.headers.get(JOB_HEADER));
  if (!Number.isInteger(jobId) || jobId <= 0 || !validJobToken(jobId, req.headers.get(JOB_TOKEN_HEADER))) return fail('FORBIDDEN', 403);
  afterResponse(() => runReviewStage(jobId));
  return ok({ accepted: true }, { status: 202 });
});
