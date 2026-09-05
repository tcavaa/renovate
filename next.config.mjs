const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy.
 *
 * Pragmatic rather than strict: Next.js inlines its bootstrap scripts, so `script-src` needs
 * `'unsafe-inline'` until a nonce pipeline exists; `'wasm-unsafe-eval'` is for the meshopt
 * decoder that unpacks the partner GLBs; the Google Fonts entries match the `@import` in
 * `globals.css`; `img-src https:` covers product photos hosted by partner stores. Development
 * additionally needs `eval` for React Refresh and a websocket for HMR.
 *
 * `form-action` lists Google because the sign-in form posts to NextAuth, which then redirects
 * to accounts.google.com — Chrome applies `form-action` to that redirect too.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // `blob:` because GLTFLoader hands the textures packed inside each GLB to the browser as
  // blob URLs and fetches them back — without it every partner model loads untextured.
  `connect-src 'self' blob:${isDev ? ' ws: wss:' : ''}`,
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.jsdelivr.net' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
