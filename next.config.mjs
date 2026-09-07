const isDev = process.env.NODE_ENV !== 'production';

/**
 * With `STORAGE_DRIVER=s3` the uploaded GLBs are fetched from the bucket's public origin, so
 * it has to be a `connect-src`; images are already covered by `img-src https:`.
 */
const s3Origin = (() => {
  try {
    return process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).origin : null;
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
 * `form-action` lists Google because the sign-in form posts to NextAuth, which then redirects
 * to accounts.google.com — Chrome applies `form-action` to that redirect too.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  // `blob:` because GLTFLoader hands the textures packed inside each GLB to the browser as
  // blob URLs and fetches them back — without it every partner model loads untextured.
  `connect-src 'self' blob:${s3Origin ? ` ${s3Origin}` : ''}${isDev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Two years, subdomains included. Browsers ignore this over plain HTTP, so it is harmless
  // in development and only takes effect once Nginx terminates TLS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/**
 * Next serves `/public` with `max-age=0`, which means every studio visit re-validates 50 MB
 * of models and 45 MB of textures. Uploads have random names and never change, so they are
 * immutable; models and textures keep their names across re-conversion, so they get a week
 * and revalidate in the background.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const ONE_WEEK = 'public, max-age=604800, stale-while-revalidate=86400';
const assetHeaders = [
  { source: '/uploads/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE }] },
  { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
  { source: '/textures/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
  { source: '/samples/:path*', headers: [{ key: 'Cache-Control', value: ONE_WEEK }] },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server for PM2: deploy/deploy.sh copies public/ and .next/static beside it.
  output: 'standalone',
  // `NEXT_DIST_DIR=.next-build pnpm build` builds beside a running dev server instead of
  // over it — the two sharing `.next` is what 404s every page (see CLAUDE.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.jsdelivr.net' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }, ...assetHeaders];
  },
};

export default nextConfig;
