/**
 * A request body for a save that can be large: JSON, gzipped in the browser when it is over a
 * megabyte (`CompressionStream`, every current browser). Vercel refuses a function's request body
 * over 4.5 MB, and a design saved with its kept versions can pass that; the routes inflate it
 * (`readJson` in lib/api/body.ts). Small saves — nearly all of them — go as plain JSON.
 */
const COMPRESS_FROM = 1024 * 1024;

export async function jsonBody(value: unknown): Promise<{ body: BodyInit; headers: Record<string, string> }> {
  const text = JSON.stringify(value);
  if (text.length < COMPRESS_FROM || typeof CompressionStream === 'undefined') {
    return { body: text, headers: { 'Content-Type': 'application/json' } };
  }
  const compressed = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return { body: compressed, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } };
}
