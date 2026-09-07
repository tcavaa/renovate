/**
 * Identifies an image by its first bytes rather than by the `Content-Type` the browser sent.
 *
 * The declared type is whatever the client says it is. A PNG renamed `.jpg` is harmless; a
 * script renamed `image.png` is not, and it would sit under `/uploads` on this origin. Every
 * upload route runs the bytes through here and refuses anything that is not really one of
 * the four image formats the app accepts.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export const IMAGE_EXTENSION: Record<ImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function sniffImage(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // GIF: "GIF87a" / "GIF89a"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * A binary glTF: `glTF` magic, container version 2, and a declared length no larger than the
 * bytes actually received. That is what the studio's GLTFLoader can open; a `.gltf` JSON with
 * sidecar files is refused because the studio has nowhere to fetch the sidecars from.
 */
export const MODEL_MIME = 'model/gltf-binary';
export const MODEL_EXTENSION = 'glb';

export function sniffModel(bytes: Uint8Array): typeof MODEL_MIME | null {
  if (bytes.length < 20) return null;
  // "glTF"
  if (!(bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  if (version !== 2) return null;
  if (length > bytes.length) return null;
  // First chunk must be JSON (0x4E4F534A) — anything else is not a well-formed GLB.
  if (view.getUint32(16, true) !== 0x4e4f534a) return null;
  return MODEL_MIME;
}
