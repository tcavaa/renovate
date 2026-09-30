/**
 * Where the browser's Draco decoder is served from: three's glTF build (the WASM and its
 * wrapper), copied into `public/vendor/draco` by `pnpm draco:decoder` and committed. Every
 * loader that reads the studio's models points its `DRACOLoader` here — the studio
 * (`modelLoader`), the catalogue's turntable (`modelPreview`), the admin uploader's preview.
 * `DRACOLoader` fetches it only when a Draco model first arrives.
 */
export const DRACO_DECODER_PATH = '/vendor/draco/';
