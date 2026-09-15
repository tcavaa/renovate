/**
 * An invisible drag image for the trays' tiles. The browser would otherwise drag a picture
 * of the whole tile across the screen; the studio shows the real thing instead — the 3D
 * model riding on the pointer, or a fitting's ghost on the wall — so the tile's picture
 * stays put and only the cursor moves.
 */

let ghost: HTMLCanvasElement | null = null;

export function emptyDragImage(): HTMLCanvasElement {
  if (!ghost) {
    ghost = document.createElement('canvas');
    ghost.width = 1;
    ghost.height = 1;
  }
  return ghost;
}
