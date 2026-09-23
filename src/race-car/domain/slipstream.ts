import { clamp } from "@/shared/domain/math";
import { CAR_SPECS } from "./car-specs";
import type { RaceCar } from "./race-car";

/**
 * Slipstream (tow) and dirty air. A car running close behind another sits in
 * its wake: less drag, so it accelerates harder and tops out faster, but the
 * turbulence also costs it grip. Figures follow the usual F1 numbers: about a
 * third less drag within a car length, fading over a few dozen metres, worth
 * 10-15 km/h at the end of a long straight.
 */
export const SLIPSTREAM = {
  /** Share of aerodynamic drag removed at full tow. */
  maxDragReduction: 0.35,
  /** Share of cornering grip lost at full dirty air. */
  maxGripLoss: 0.1,
  /** Tow fades with the gap between bumpers (metres). */
  towCloseGap: 4,
  towFalloff: 14,
  towReach: 55,
  /** Dirty air is short-range. */
  dirtyCloseGap: 2,
  dirtyFalloff: 9,
  dirtyReach: 30,
  /** The wake is about a car wide: full inside `core`, gone at `edge` (metres off its centreline). */
  towCore: 0.5,
  towEdge: 2.5,
  dirtyEdge: 3,
  /** Both cars must point roughly the same way, and the leader must be moving. */
  minAlignment: 0.8,
  minLeaderSpeed: 15,
} as const;

/** How much of the leader's wake reaches a follower, from 0 to 1. */
function wakeStrength(gap: number, offCentre: number, closeGap: number, falloff: number, reach: number, core: number, edge: number): number {
  const along = Math.exp(-Math.max(0, gap - closeGap) / falloff) * clamp(1 - gap / reach, 0, 1);
  const across = clamp(1 - (Math.abs(offCentre) - core) / (edge - core), 0, 1);
  return along * across;
}

/**
 * Works out, for every car, the wake it is running in. Call once per
 * simulation step, before the cars move.
 */
export function updateWakes(cars: readonly RaceCar[]): void {
  const S = SLIPSTREAM;
  for (const follower of cars) {
    let tow = 0, dirty = 0;
    let source: RaceCar | null = null;
    const fh = follower.heading;
    for (const leader of cars) {
      if (leader === follower || leader.speed < S.minLeaderSpeed) continue;
      const dx = follower.x - leader.x, dz = follower.z - leader.z;
      if (Math.abs(dx) > S.towReach + CAR_SPECS.length || Math.abs(dz) > S.towReach + CAR_SPECS.length) continue;
      if (Math.cos(fh - leader.heading) < S.minAlignment) continue;

      const sin = Math.sin(leader.heading), cos = Math.cos(leader.heading);
      const behind = -(dx * sin + dz * cos); // positive when the follower is behind the leader
      if (behind <= 0) continue;
      const offCentre = dx * -cos + dz * sin;
      const gap = Math.max(0, behind - CAR_SPECS.length);

      const t = wakeStrength(gap, offCentre, S.towCloseGap, S.towFalloff, S.towReach, S.towCore, S.towEdge);
      if (t > tow) {
        tow = t;
        source = leader;
      }
      dirty = Math.max(dirty, wakeStrength(gap, offCentre, S.dirtyCloseGap, S.dirtyFalloff, S.dirtyReach, S.towCore, S.dirtyEdge));
    }
    follower.tow = tow;
    follower.towSource = tow > 0 ? source : null;
    follower.dirtyAir = dirty;
  }
}
