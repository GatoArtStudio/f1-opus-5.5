import { clamp } from "@/shared/domain/math";

export interface ElevationHarmonic {
  /** Whole number of cycles per lap, so the profile closes on itself. */
  cycles: number;
  amplitude: number;
  phase: number;
}

/** Closed-loop height profile along the lap, in metres above the start line. */
export interface ElevationSpec {
  harmonics: readonly ElevationHarmonic[];
  bias: number;
  /** Uniform factor applied last (used to cap the steepest gradient). */
  scale: number;
}

/** The track stays level around the start line: the grid and the stands live there. */
const FLAT_BEFORE_START = 420;
const FLAT_AFTER_START = 400; // covers the whole pit lane
const FLAT_RAMP = 250;
/** Softens the floor so the profile never dips below the start level. */
const FLOOR_SOFTNESS = 1.5;

/** Distance from the start line, negative before it. */
function signedStartDistance(dist: number, length: number): number {
  return dist > length / 2 ? dist - length : dist;
}

/** True where the track is held level around the start/finish line. */
export function isInStartZone(dist: number, length: number, margin = 0): boolean {
  const u = signedStartDistance(dist, length);
  return u > -(FLAT_BEFORE_START + margin) && u < FLAT_AFTER_START + margin;
}

function levelness(dist: number, length: number): number {
  const u = signedStartDistance(dist, length);
  const outside = u < -FLAT_BEFORE_START ? -FLAT_BEFORE_START - u : u > FLAT_AFTER_START ? u - FLAT_AFTER_START : 0;
  const t = clamp(outside / FLAT_RAMP, 0, 1);
  return t * t * (3 - 2 * t);
}

export function elevationAt(spec: ElevationSpec, dist: number, length: number): number {
  let sum = spec.bias;
  for (const h of spec.harmonics) sum += h.amplitude * Math.sin((2 * Math.PI * h.cycles * dist) / length + h.phase);
  const positive = 0.5 * (sum + Math.sqrt(sum * sum + FLOOR_SOFTNESS * FLOOR_SOFTNESS));
  return spec.scale * levelness(dist, length) * positive;
}
