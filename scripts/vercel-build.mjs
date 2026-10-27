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
 * The catalogue is not touched: the products table is the truth, as admin left it. `pnpm
 * models:seed` made it match the model manifests on every deploy, which put back the products
 * admin had deleted and the names and prices admin had changed. Run it by hand (or set the flag
 * for one deployment) when a pipeline has written new models into a manifest.
 *
 *   SKIP_DB_MIGRATIONS=1   build without migrating (a redeploy of an old commit, say)
 *   RUN_MODELS_SEED=1      also make the catalogue match the model manifests first
 */
import { execSync } from 'node:child_process';

const run = (command) => {
  console.log(`\n▶ ${command}`);
  execSync(command, { stdio: 'inherit' });
};

if (process.env.VERCEL_ENV === 'production') {
  if (process.env.SKIP_DB_MIGRATIONS !== '1') run('pnpm db:migrate');
  if (process.env.RUN_MODELS_SEED === '1') run('pnpm models:seed');
} else {
  console.log(`vercel-build: ${process.env.VERCEL_ENV ?? 'local'} build — the database is left alone`);
}
run('pnpm exec next build');
