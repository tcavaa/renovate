/* eslint-disable no-console */
/**
 * What Vercel runs instead of `pnpm build` (`vercel-build` in package.json; docs/operations.md#deploying).
 *
 * A production deployment first runs the pending migrations (`pnpm db:migrate`, through
 * `DATABASE_MIGRATION_URL`) and only then builds. A failing migration fails the deployment, and
 * the one before it keeps serving; so a migration must be safe while the previous version still
 * runs (docs/data-model.md#migrations-on-postgres). A preview deployment touches no database: it
 * only builds.
 *
 * **A deployment never touches the products.** The products table is the truth, as the team left
 * it in admin — styles assigned, products deleted, names, prices and stores changed. `pnpm
 * models:seed` made it match the model manifests on every deploy, which put the deleted products
 * back and the edited ones back to the manifest's; there is no switch for it here any more (there
 * used to be `RUN_MODELS_SEED`). Products a release needs come in a migration that inserts them
 * and skips what already exists (`0011_boiler_cabinet_materials`, say); the seed is run by hand,
 * deliberately (`pnpm models:seed --production`).
 *
 *   SKIP_DB_MIGRATIONS=1   build without migrating (a redeploy of an old commit, say)
 */
import { execSync } from 'node:child_process';

const run = (command) => {
  console.log(`\n▶ ${command}`);
  execSync(command, { stdio: 'inherit' });
};

if (process.env.VERCEL_ENV === 'production') {
  if (process.env.SKIP_DB_MIGRATIONS !== '1') run('pnpm db:migrate');
} else {
  console.log(`vercel-build: ${process.env.VERCEL_ENV ?? 'local'} build — the database is left alone`);
}
run('pnpm exec next build');
