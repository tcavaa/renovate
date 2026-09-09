/**
 * Passenger entry point for cPanel ("Setup Node.js App").
 *
 * cPanel runs Node apps through Phusion Passenger, which starts one startup file in the
 * application root. `next build` (output: 'standalone') already emits a complete server under
 * .next/standalone; this file only hands off to it. Passenger hooks `listen()`, so whatever
 * port the standalone server picks is ignored in favour of Passenger's own socket.
 *
 * Before starting: build, then copy `public/` and `.next/static` beside the standalone
 * server — `deploy/cpanel.sh` does all of it. Environment variables come from the Node.js
 * app's settings in cPanel (and `.env.production` for the build-time NEXT_PUBLIC_* ones).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
require('./.next/standalone/server.js');
