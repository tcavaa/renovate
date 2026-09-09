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
const path = require('node:path');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// @next/env is next's own dependency; resolve it from next's directory so a pnpm layout works.
const nextDir = path.dirname(require.resolve('next/package.json'));
const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [nextDir] }));
loadEnvConfig(__dirname, false);

const distDir = process.env.NEXT_DIST_DIR || '.next';
require(path.join(__dirname, distDir, 'standalone', 'server.js'));
