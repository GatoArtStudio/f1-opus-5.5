export type RandomSource = () => number;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Signed smallest difference a - b, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function randomBetween([min, max]: readonly [number, number], random: RandomSource): number {
  return min + random() * (max - min);
}

export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
