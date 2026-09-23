import type { CircuitOutline } from "@/race/application/race-ui-state";

export interface OutlineBounds {
  minX: number;
  minZ: number;
  spanX: number;
  spanZ: number;
}

export interface CanvasSize {
  w: number;
  h: number;
  dpr: number;
}

export type ToCanvas = (x: number, z: number) => [number, number];

const PADDING = 14; // CSS pixels around the track

export function boundsOf({ xs, zs }: CircuitOutline): OutlineBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minZ = Math.min(minZ, zs[i]);
    maxZ = Math.max(maxZ, zs[i]);
  }
  return { minX, minZ, spanX: maxX - minX, spanZ: maxZ - minZ };
}

/** World (x, z) to canvas pixels, fitting the whole track centred in the canvas. */
export function fitToCanvas(bounds: OutlineBounds, { w, h, dpr }: CanvasSize): ToCanvas {
  const pad = PADDING * dpr;
  const scale = Math.min((w - pad * 2) / bounds.spanX, (h - pad * 2) / bounds.spanZ);
  const ox = (w - bounds.spanX * scale) / 2, oz = (h - bounds.spanZ * scale) / 2;
  return (x, z) => [ox + (x - bounds.minX) * scale, oz + (z - bounds.minZ) * scale];
}

/** The track's shape plus the start/finish marker. */
export function drawCircuitOutline(g: CanvasRenderingContext2D, outline: CircuitOutline, toCanvas: ToCanvas, dpr: number) {
  const path = new Path2D();
  const n = outline.xs.length;
  for (let i = 0; i <= n; i += 3) {
    const [x, y] = toCanvas(outline.xs[i % n], outline.zs[i % n]);
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineWidth = 9 * dpr;
  g.stroke(path);
  g.strokeStyle = "#d9dde3";
  g.lineWidth = 4 * dpr;
  g.stroke(path);

  const [sx, sy] = toCanvas(outline.xs[0], outline.zs[0]);
  g.fillStyle = "#e10600";
  g.fillRect(sx - 2 * dpr, sy - 7 * dpr, 4 * dpr, 14 * dpr);
}
