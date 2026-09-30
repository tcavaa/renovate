/**
 * Every model in `public/models` as the studio should download it: WebP textures, and Draco
 * geometry where that pays (`scripts/lib/compressModels.ts`). The model pipelines run this as
 * their last step; on its own it is for the files already there.
 *
 *   pnpm models:compress                 every model
 *   pnpm models:compress --only=a,b      the models whose file name (without .glb) is listed
 *   pnpm models:compress --dry-run       report what would change, write nothing
 */

import { compressModels } from './lib/compressModels';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean) ?? null;

compressModels({ only, dryRun: args.includes('--dry-run') }).catch((error) => {
  console.error(error);
  process.exit(1);
});
