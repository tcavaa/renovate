import NextImage, { type ImageProps } from 'next/image';

/**
 * `next/image` for its layout (`fill`, `sizes`, lazy loading, `priority`), never its optimizer:
 * the picture is served as it is stored. On Vercel `/_next/image` is billed per image, and every
 * picture here is already small — uploads are WebP within 1600 px when they arrive
 * (`lib/uploads/imageOptimize.ts`), the seed pictures by `pnpm photos:webp`. `next.config.mjs`
 * sets `images.unoptimized` as well, so nothing else reaches the optimizer either; a partner's
 * picture on any host shows as it is (it used to answer `/_next/image` with a 400).
 */
export default function Image(props: ImageProps) {
  // eslint-disable-next-line jsx-a11y/alt-text -- `alt` is the caller's, passed through.
  return <NextImage {...props} unoptimized />;
}
