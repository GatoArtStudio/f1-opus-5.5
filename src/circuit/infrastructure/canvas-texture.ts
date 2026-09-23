import * as THREE from "three";

export function canvasTexture(
  size: number,
  draw: (g: CanvasRenderingContext2D, size: number) => void,
  anisotropy = 1,
  repeat = true,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Fills with a base colour and sprinkles light/dark speckles. */
export function paintNoise(g: CanvasRenderingContext2D, size: number, base: string, spread: number, count: number) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const l = Math.random() * spread - spread / 2;
    g.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}

/**
 * Ground-level layers are drawn in a fixed order without writing depth, so
 * they never z-fight regardless of depth-buffer precision.
 */
export const FLAT_RENDER_ORDER = { sky: -10, ground: -9, road: -8, marks: -7 } as const;
