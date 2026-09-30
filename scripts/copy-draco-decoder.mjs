/* eslint-disable no-console */
/**
 * Copies three's Draco decoder (the glTF build: the WASM and its wrapper) into
 * public/vendor/draco so the studio can read Draco-compressed models from this origin.
 *
 * The models' geometry is Draco where that pays (`pnpm models:compress`, the upload recipe);
 * `DRACOLoader` fetches these two files and decodes in web workers of its own, which the CSP
 * allows from 'self' and blob:. The copy is committed; this script is for upgrades of three.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const source = path.join(process.cwd(), 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
const target = path.join(process.cwd(), 'public', 'vendor', 'draco');
mkdirSync(target, { recursive: true });
for (const file of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  copyFileSync(path.join(source, file), path.join(target, file));
  console.log(`copied ${file} → ${path.relative(process.cwd(), target)}`);
}
