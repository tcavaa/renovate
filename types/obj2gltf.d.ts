/**
 * `obj2gltf` ships no types. Only the one call shape the conversion script uses is declared —
 * a fuller definition would be guesswork against a JS package we invoke once.
 */
declare module 'obj2gltf' {
  interface Obj2GltfOptions {
    /** Write a single .glb rather than .gltf + .bin. */
    binary?: boolean;
    /** Emit KHR_materials_unlit. Needs the extension registered on the reader. */
    unlit?: boolean;
    secondaryColorAttribute?: boolean;
  }

  /** Resolves to a Buffer when `binary` is set, otherwise to a glTF JSON object. */
  export default function obj2gltf(
    objPath: string,
    options?: Obj2GltfOptions
  ): Promise<Buffer | Record<string, unknown>>;
}
