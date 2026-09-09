/**
 * Loads .env.local, then .env, into process.env — for scripts run with tsx.
 *
 * Import this first, as a side effect (`import './lib/loadEnv';`), before anything that
 * reaches `lib/env.ts`. The obvious form — `import { config } from 'dotenv'; config(...)`
 * followed by `import { db } from '../lib/db'` — does not work: imports are hoisted and
 * evaluated in order before the module body runs, so `lib/env.ts` validated an empty
 * environment and the dotenv call came too late. Development never noticed because every
 * variable has a development default; with NODE_ENV=production (the cPanel deploy running
 * `pnpm db:migrate` from a .env file) it failed on the first required variable.
 *
 * Variables already in the environment win: dotenv never overwrites an existing value.
 */
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
