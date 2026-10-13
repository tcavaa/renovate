import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import type { ApiBody } from './route';

const inflate = promisify(gunzip);
const deflate = promisify(gzip);

/** The most a JSON body may hold once inflated: a design with every kept version is ~7 MB. */
const MAX_JSON_BYTES = 32 * 1024 * 1024;
/** From this size an answer is worth compressing in the function itself. */
const COMPRESS_FROM = 512 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super('BODY_TOO_LARGE');
    this.name = 'BodyTooLargeError';
  }
}

/**
 * A request's JSON, inflated first when the browser sent it gzipped (`Content-Encoding: gzip`,
 * `lib/flow/jsonBody.ts`). Vercel refuses a function's request body over 4.5 MB, and a design
 * saved with its kept versions can pass that (docs/operations.md#request-and-response-size);
 * gzipped it is a tenth. Inflating stops at `MAX_JSON_BYTES`. Returns null for a body that is
 * not JSON, as `req.json().catch(() => null)` did.
 */
export async function readJson(req: Request): Promise<unknown> {
  const encoding = (req.headers.get('content-encoding') ?? '').toLowerCase();
  try {
    if (encoding !== 'gzip') return await req.json();
    const raw = Buffer.from(await req.arrayBuffer());
    const text = (await inflate(raw, { maxOutputLength: MAX_JSON_BYTES })).toString('utf8');
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof RangeError || (e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE') throw new BodyTooLargeError();
    return null;
  }
}

/**
 * `ok(data)` for an answer that can be large: gzipped in the function when it is over half a
 * megabyte and the browser takes gzip, so it stays under Vercel's 4.5 MB answer limit (the kept
 * versions of a large design run to ~7 MB of JSON). Small answers go as they are, compressed by
 * the CDN as usual.
 */
export async function okLarge<T>(req: Request, data: T): Promise<NextResponse<ApiBody<T>>> {
  const text = JSON.stringify({ data, error: null });
  const accepts = (req.headers.get('accept-encoding') ?? '').toLowerCase().includes('gzip');
  if (text.length < COMPRESS_FROM || !accepts) {
    return new NextResponse(text, { headers: { 'content-type': 'application/json' } }) as NextResponse<ApiBody<T>>;
  }
  const body = await deflate(Buffer.from(text, 'utf8'));
  return new NextResponse(new Uint8Array(body), {
    headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', vary: 'accept-encoding' },
  }) as NextResponse<ApiBody<T>>;
}
