// Since SDK v11 the build wrapper is its own entry point; the package root is the runtime SDK.
import { withSentryConfig } from '@sentry/nextjs/config';

const isDev = process.env.NODE_ENV !== 'production';

/** Vercel's build (and its functions) set `VERCEL=1`; the self-hosted builds do not. */
const onVercel = process.env.VERCEL === '1';

/**
 * Supabase Storage (`STORAGE_DRIVER=supabase`, docs/uploads.md): the uploaded GLBs are fetched
 * from it and the browser sends uploads straight to it, so its origin has to be a `connect-src`
 * (its pictures are already covered by `img-src https:`). Read at build time — set
 * `SUPABASE_URL` where the build runs.
 */
const supabaseOrigin = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
})();

/**
 * Content Security Policy.
 *
 * Pragmatic rather than strict: Next.js inlines its bootstrap scripts, so `script-src` needs
 * `'unsafe-inline'` until a nonce pipeline exists; `'wasm-unsafe-eval'` is for the meshopt
 * decoder that unpacks the partner GLBs; `img-src https:` covers product photos hosted by
 * partner stores. Fonts are self-hosted through `next/font`, so no font origin is listed.
 * Development additionally needs `eval` for React Refresh and a websocket for HMR.
 *
 * `form-action` must admit Google because the sign-in form posts to NextAuth, which then
 * redirects to accounts.google.com — Chrome applies `form-action` to that redirect too (and
 * 3-D Secure, below, needs any https origin anyway).
 *
 * Card payments (docs/payments.md): Flitt's embedded form is its script and styles from
 * pay.flitt.com, its fonts, and its gateway in an iframe from the same host; Google Pay and
 * Apple Pay load their own scripts when the merchant has them. 3-D Secure is the card's bank
 * — any bank — and Flitt's SDK posts a form from this page into an iframe it puts over it, so
 * `frame-src` and `form-action` take any https origin.
 *
 * Sentry needs nothing here: the browser sends its events to `/monitoring` on this origin
 * (app/monitoring/route.ts), which forwards them to our own Sentry project.
 */
const flitt = 'https://pay.flitt.com';
const wallets = 'https://pay.google.com https://google.com https://www.google.com https://applepay.cdn-apple.com';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} ${flitt} ${wallets}`,
  `style-src 'self' 'unsafe-inline' ${flitt}`,
  `font-src 'self' data: ${flitt} https://applepay.cdn-apple.com`,
  "img-src 'self' data: blob: https:",
  // `blob:` because GLTFLoader hands the textures packed inside each GLB to the browser as
  // blob URLs and fetches them back — without it every partner model loads untextured.
  `connect-src 'self' blob: ${flitt} ${wallets}${supabaseOrigin ? ` ${supabaseOrigin}` : ''}${isDev ? ' ws: wss:' : ''}`,
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // `payment` for Google Pay and Apple Pay inside Flitt's form.
  { key: 'Permissions-Policy', value: `camera=(), microphone=(), geolocation=(), payment=(self "${flitt}" "https://pay.google.com")` },
  // Two years, subdomains included. Browsers ignore this over plain HTTP, so it is harmless in
  // development; Vercel serves only HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/**
 * Next serves `/public` with `max-age=0`, which means every studio visit re-validates 23 MB
 * of models and 45 MB of textures. The seed pictures under `/uploads` keep their names for good,
 * so they are immutable (uploads made at run time live in Supabase Storage, with a year's cache
 * of their own); models, textures and the vendored decoders keep their names across
 * re-conversion and upgrades, so they get a week and revalidate in the background. Vercel's CDN
 * honours these headers for the files it serves from `public/`.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const ONE_WEEK = 'public, max-age=604800, stale-while-revalidate=86400';
const assetHeaders = [
  { source: '/uploads/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE }] },
  { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
  { source: '/vendor/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
  { source: '/textures/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
  { source: '/samples/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
];

// Shared hosting (cPanel) builds under a per-account memory cap, and the build's worker pool
// is sized from the machine's CPU count — dozens of processes on a big shared box. With
// RENOVATE_LOW_MEMORY=1 (set by deploy/cpanel.sh) the build runs on one worker and skips
// the in-build type check; `pnpm type-check` runs before every push and in CI.
const lowMemory = process.env.RENOVATE_LOW_MEMORY === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: lowMemory },
  // Kept out of the server chunks and loaded from node_modules: draco3d because its encoder reads
  // the .wasm beside its own file (the upload recipe's Draco, lib/uploads/glbOptimizeServer.ts).
  // The tracer copies the whole package, .wasm included — an `outputFileTracingIncludes` for the
  // .wasm made a second node_modules/draco3d of the two files alone and broke the require.
  serverExternalPackages: ['draco3d'],
  // A self-contained server only where the app runs as one (the legacy cPanel / VPS deploys copy
  // public/ and .next/static beside it); Vercel builds its own functions.
  ...(onVercel ? {} : { output: 'standalone' }),
  // What the functions' file tracing must and must not carry. `public/` is served by the CDN,
  // and `lib/storage/local.ts` naming `public/uploads` once pulled every seed picture (and any
  // local library import) into every function that touches storage — the 250 MB function limit.
  // The plan reader still reads the bundled sample plan from disk.
  outputFileTracingIncludes: { '/api/design/parse-plan': ['./public/samples/**'] },
  outputFileTracingExcludes: {
    '*': ['./public/uploads/**', './public/library/**', './public/models/**', './public/textures/**', './.uploads-staging/**', './logs/**', './coverage/**', './test-results/**'],
  },
  // `NEXT_DIST_DIR=.next-build pnpm build` builds beside a running dev server instead of
  // over it — the two sharing `.next` is what 404s every page (see CLAUDE.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Pictures are served as they are stored — no `/_next/image`: Vercel bills every image it
  // optimizes, and every picture here is already a WebP within 1600 px (uploads are converted on
  // arrival, the seed pictures by `pnpm photos:webp`). `components/ui/image.tsx` passes
  // `unoptimized` too.
  images: { unoptimized: true },
  // No server actions anywhere (no 'use server'): uploads are route handlers with their own limits.
  experimental: {
    ...(lowMemory ? { cpus: 1 } : {}),
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }, ...assetHeaders];
  },
  async redirects() {
    return [
      // The finish textures are WebP (`pnpm textures:webp`); migration 0021 rewrote the stored
      // URLs, and a page, a browser's cached design or an order that still asks for the JPEG
      // lands on the file that replaced it.
      { source: '/textures/:name([^/]+)\\.jpg', destination: '/textures/:name.webp', permanent: true },
    ];
  },
};

/**
 * Sentry (docs/operations.md#errors-go-to-sentry). The runtime side is `lib/sentry.ts` and the
 * instrumentation files; this is the build: the browser source
 * maps uploaded to Sentry and then deleted from the build, so stack traces read as source while
 * no `.map` is served. Without `SENTRY_AUTH_TOKEN` (a local build, CI) no source maps are made
 * at all — with nowhere to upload them they would only be published.
 */
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;

export default withSentryConfig(nextConfig, {
  org: 'project-renovation',
  project: 'javascript-nextjs',
  authToken: sentryAuthToken,
  sourcemaps: { disable: !sentryAuthToken },
  // Next's own chunks too, so a stack through the router or React reads as source.
  widenClientFileUpload: true,
  // No `tunnelRoute`: it relays to any Sentry project named in the query and passes the
  // cookies on. The tunnel is app/monitoring/route.ts.
  silent: !process.env.CI,
  telemetry: false,
});
