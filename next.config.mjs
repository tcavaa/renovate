// Since SDK v11 the build wrapper is its own entry point; the package root is the runtime SDK.
import { withSentryConfig } from '@sentry/nextjs/config';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * With `STORAGE_DRIVER=s3` the uploaded GLBs are fetched from the bucket's public origin, so
 * it has to be a `connect-src` (images are already covered by `img-src https:`), and the
 * product, store and furniture photos there have to be allowed for `next/image`, which
 * refuses any remote host it was not told about.
 */
const s3Url = (() => {
  try {
    return process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL) : null;
  } catch {
    return null;
  }
})();
const s3Origin = s3Url?.origin ?? null;
const s3ImagePattern = s3Url
  ? {
      protocol: s3Url.protocol.replace(':', ''),
      hostname: s3Url.hostname,
      ...(s3Url.port ? { port: s3Url.port } : {}),
      pathname: `${s3Url.pathname.replace(/\/$/, '')}/**`,
    }
  : null;

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
 * (`tunnelRoute` below), which Next rewrites to Sentry's ingest host.
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
  `connect-src 'self' blob: ${flitt} ${wallets}${s3Origin ? ` ${s3Origin}` : ''}${isDev ? ' ws: wss:' : ''}`,
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
  // Two years, subdomains included. Browsers ignore this over plain HTTP, so it is harmless
  // in development and only takes effect once Nginx terminates TLS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/**
 * Next serves `/public` with `max-age=0`, which means every studio visit re-validates 23 MB
 * of models and 45 MB of textures. Uploads have random names and do not change — an old model
 * optimized in place (`pnpm uploads:optimize-models`) is the one exception, and a browser's
 * cached copy of it stays a valid model — so they are immutable; models, textures and the
 * vendored decoders keep their names across re-conversion and upgrades, so they get a week and
 * revalidate in the background.
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
  // Shipped in the standalone server's node_modules instead of being bundled into the server
  // chunks: mysql2 so deploy/migrate.cjs can load it on a host that has no other node_modules,
  // draco3d because its encoder reads the .wasm beside its own file (the upload recipe's Draco,
  // lib/uploads/glbOptimizeServer.ts; also what the deploy's optimize-models.cjs loads). The
  // tracer copies the whole package, .wasm included — an `outputFileTracingIncludes` for the
  // .wasm made a second node_modules/draco3d of the two files alone and broke the require.
  serverExternalPackages: ['mysql2', 'draco3d'],
  // Self-contained server for PM2 / Passenger: deploy/deploy.sh and deploy/cpanel.sh copy
  // public/ and .next/static beside it.
  output: 'standalone',
  // `NEXT_DIST_DIR=.next-build pnpm build` builds beside a running dev server instead of
  // over it — the two sharing `.next` is what 404s every page (see CLAUDE.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.jsdelivr.net' },
      { protocol: 'https', hostname: 'placehold.co' },
      ...(s3ImagePattern ? [s3ImagePattern] : []),
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
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
 * instrumentation files; this is the build: the `/monitoring` tunnel, and the browser source
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
  // A fixed path, not `true` (a random one per build): proxy.ts's matcher must keep missing it.
  tunnelRoute: '/monitoring',
  silent: !process.env.CI,
  telemetry: false,
});
