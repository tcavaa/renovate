/**
 * Passenger entry point for cPanel ("Setup Node.js App").
 *
 * cPanel runs Node apps through Phusion Passenger, which starts one startup file in the
 * application root. `next build` (output: 'standalone') already emits a complete server under
 * .next/standalone; this file only hands off to it. Passenger hooks `listen()`, so whatever
 * port the standalone server picks is ignored in favour of Passenger's own socket.
 *
 * The standalone server changes directory into .next/standalone and never sees the app
 * root's .env, so it is loaded here first (deploy/lib/env.cjs). Variables set in the Node.js
 * app's settings in cPanel win: nothing already in the environment is overwritten.
 * `deploy/cpanel.sh` builds — or, in release mode, receives from CI — what this file starts.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFiles } = require('./deploy/lib/env.cjs');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const distDir = process.env.NEXT_DIST_DIR || '.next';
const standalone = path.join(__dirname, distDir, 'standalone', 'server.js');

if (!fs.existsSync(standalone)) {
  console.error(
    `renovate: the app is not built (${standalone} is missing).\n` +
      'Run the deploy first: cPanel → Git Version Control → Manage → Pull or Deploy → "Deploy HEAD Commit".\n' +
      'It puts the built server in place, applies migrations and restarts the app; each run is logged\n' +
      'to ~/renovate/logs/deploy.log. It stops early when ~/renovate/.env is missing.'
  );
  process.exit(1);
}

loadEnvFiles(__dirname);
require(standalone);
