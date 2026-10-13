/* eslint-disable no-console */
/**
 * What Vercel runs instead of `pnpm build` (`vercel-build` in package.json; docs/operations.md#deploying).
 *
 * A production deployment first brings the database up to date — the pending migrations
 * (`pnpm db:migrate`, through `DATABASE_MIGRATION_URL`) and the catalogue made to match the model
 * manifests (`pnpm models:seed`, as every cPanel deploy did) — and only then builds. Either failing
 * fails the deployment, and the one before it keeps serving; so a migration must be safe while the
 * previous version still runs (docs/data-model.md#migrations-on-postgres). A preview deployment
 * touches no database: it only builds.
 *
 *   SKIP_DB_MIGRATIONS=1   build without migrating (a redeploy of an old commit, say)
 *   SKIP_MODELS_SEED=1     build without syncing the catalogue
 */
import { execSync } from 'node:child_process';

const run = (command) => {
  console.log(`\n▶ ${command}`);
  execSync(command, { stdio: 'inherit' });
};

if (process.env.VERCEL_ENV === 'production') {
  if (process.env.SKIP_DB_MIGRATIONS !== '1') run('pnpm db:migrate');
  if (process.env.SKIP_MODELS_SEED !== '1') run('pnpm models:seed');
} else {
  console.log(`vercel-build: ${process.env.VERCEL_ENV ?? 'local'} build — the database is left alone`);
}
run('pnpm exec next build');
