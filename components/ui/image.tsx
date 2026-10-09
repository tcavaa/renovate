import NextImage, { type ImageProps } from 'next/image';

/**
 * `next/image`, except for a picture on a host the optimiser does not fetch from
 * (`images.remotePatterns` in next.config.mjs): that one is shown as it is. A partner may give
 * any picture URL (the product schema takes any), and `/_next/image` answered those with a 400
 * — a broken picture in the catalogue, the studio and the admin. Our own files and the listed
 * hosts are optimised as before.
 */
const OPTIMISED_HOSTS = new Set(['images.unsplash.com', 'cdn.jsdelivr.net', 'placehold.co']);

export function optimisable(src: ImageProps['src']): boolean {
  if (typeof src !== 'string') return true;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && OPTIMISED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export default function Image(props: ImageProps) {
  // eslint-disable-next-line jsx-a11y/alt-text -- `alt` is the caller's, passed through.
  return <NextImage {...props} unoptimized={props.unoptimized || !optimisable(props.src)} />;
}
