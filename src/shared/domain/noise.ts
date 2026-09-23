import { createSeededRandom } from "./seeded-random";

export type Noise2D = (x: number, y: number) => number;

/** Smooth value noise in [-1, 1]; the same seed always gives the same field. */
export function createNoise2D(seed: string): Noise2D {
  const random = createSeededRandom(`${seed}#noise`);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const values = Array.from({ length: 256 }, () => random() * 2 - 1);
  const lattice = (ix: number, iy: number) => values[perm[(perm[ix & 255] + iy) & 255]];
  const fade = (t: number) => t * t * (3 - 2 * t);

  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = fade(x - ix), fy = fade(y - iy);
    const top = lattice(ix, iy) + (lattice(ix + 1, iy) - lattice(ix, iy)) * fx;
    const bottom = lattice(ix, iy + 1) + (lattice(ix + 1, iy + 1) - lattice(ix, iy + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/** Fractal sum of `noise` octaves, normalised back into [-1, 1]. */
export function fractalNoise(noise: Noise2D, x: number, y: number, octaves = 4): number {
  let sum = 0, amplitude = 1, frequency = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}
