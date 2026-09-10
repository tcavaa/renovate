/* eslint-disable no-console */
/**
 * Copies pdf.js's worker into public/vendor so the browser can load it from this origin.
 *
 * The plan upload rasterises a PDF on the client with pdfjs-dist, which runs its parser in a
 * web worker; the CSP only allows workers from 'self', so the file has to be served by the
 * app rather than a CDN. The copy is committed; this script is for upgrades of pdfjs-dist.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const source = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const target = path.join(process.cwd(), 'public', 'vendor', 'pdf.worker.min.mjs');
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copied ${source} → ${target}`);
