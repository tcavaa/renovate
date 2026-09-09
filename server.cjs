/**
 * Passenger entry point for cPanel ("Setup Node.js App").
 *
 * cPanel runs Node apps through Phusion Passenger, which starts one startup file in the
 * application root. `next build` (output: 'standalone') already emits a complete server under
 * .next/standalone; this file only hands off to it. Passenger hooks `listen()`, so whatever
 * port the standalone server picks is ignored in favour of Passenger's own socket.
 *
 * The standalone server changes directory into .next/standalone and reads its .env files
 * from there, so the app root's .env (and .env.production) is loaded here first. Variables
 * set in the Node.js app's settings in cPanel win: nothing already in the environment is
 * overwritten. `deploy/cpanel.sh` builds and assembles what this file starts.
 */
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const distDir = process.env.NEXT_DIST_DIR || '.next';
const standalone = path.join(__dirname, distDir, 'standalone', 'server.js');

function fail(reason) {
  console.error(
    `renovate: ${reason}.\n` +
      'Run the deploy first: cPanel → Git Version Control → Manage → Pull or Deploy → "Deploy HEAD Commit".\n' +
      'It installs the dependencies, builds the app, applies migrations and restarts it; the log of each\n' +
      'run is in ~/.cpanel/logs. It stops before installing anything when ~/renovate/.env is missing.'
  );
  process.exit(1);
}

// @next/env is next's own dependency; resolve it from next's directory so a pnpm layout works.
let nextDir;
try {
  nextDir = path.dirname(require.resolve('next/package.json'));
} catch {
  fail('the dependencies are not installed (node_modules/next is missing)');
}
if (!fs.existsSync(standalone)) fail(`the app is not built (${standalone} is missing)`);

const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [nextDir] }));
loadEnvConfig(__dirname, false);

require(standalone);
