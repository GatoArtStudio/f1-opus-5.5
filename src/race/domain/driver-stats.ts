/**
 * How good each bot driver is at the different parts of racing, from 0 to 100.
 * Only bots have stats: the player's results depend on the player.
 */
export interface DriverStats {
  /** Raw speed of the driver and car: top speed and acceleration. */
  pace: number;
  /** How close to the limit of the grip they take corners. */
  cornering: number;
  /** How late and how hard they brake. */
  braking: number;
  /** Keeps a clean line and avoids slips and off days. */
  consistency: number;
  /** Willingness to go for a gap and stay close to the car ahead. */
  aggression: number;
  /** How well they keep a car behind, and how quickly they react to being followed. */
  defence: number;
  /** Pace kept when the track has little grip (wet, snow, sand, ash). */
  wet: number;
  /** Wearing the tyres slowly, and reading weather and stops well. */
  tyres: number;
  /** Getting away from the grid when the lights go out. */
  start: number;
}

export type StatKey = keyof DriverStats;

export const STAT_KEYS: readonly StatKey[] = ["pace", "cornering", "braking", "consistency", "aggression", "defence", "wet", "tyres", "start"];

/**
 * Stats by driver code. Each fictional driver echoes the reputation of the real
 * one whose code they carry: the rain specialist, the tyre whisperer, the fast
 * but error-prone qualifier, the hard racer who goes off the boil...
 */
export const DRIVER_STATS: Record<string, DriverStats> = {
  // Champion-level, complete.
  VER: { pace: 96, cornering: 95, braking: 92, consistency: 88, aggression: 95, defence: 93, wet: 93, tyres: 82, start: 94 },
  // Seven-time-champion craft: outstanding in the wet, smooth on tyres.
  HAM: { pace: 93, cornering: 92, braking: 88, consistency: 91, aggression: 86, defence: 89, wet: 97, tyres: 92, start: 92 },
  // One-lap speed, but slips under pressure and eats tyres.
  LEC: { pace: 95, cornering: 93, braking: 90, consistency: 76, aggression: 86, defence: 82, wet: 86, tyres: 72, start: 90 },
  // The veteran: never gives a place away, makes tyres last, brilliant starts.
  ALO: { pace: 89, cornering: 91, braking: 91, consistency: 96, aggression: 90, defence: 97, wet: 90, tyres: 97, start: 96 },
  // Smooth and consistent, a strategist.
  SAI: { pace: 88, cornering: 88, braking: 89, consistency: 93, aggression: 80, defence: 86, wet: 86, tyres: 92, start: 88 },
  NOR: { pace: 93, cornering: 92, braking: 88, consistency: 87, aggression: 84, defence: 84, wet: 88, tyres: 84, start: 80 },
  // Cool-headed, rarely makes mistakes.
  PIA: { pace: 92, cornering: 91, braking: 90, consistency: 92, aggression: 82, defence: 86, wet: 87, tyres: 88, start: 86 },
  RUS: { pace: 91, cornering: 90, braking: 89, consistency: 90, aggression: 84, defence: 85, wet: 94, tyres: 87, start: 84 },
  ALB: { pace: 84, cornering: 85, braking: 86, consistency: 86, aggression: 78, defence: 84, wet: 84, tyres: 90, start: 82 },
  GAS: { pace: 83, cornering: 84, braking: 84, consistency: 80, aggression: 82, defence: 80, wet: 82, tyres: 80, start: 80 },
  // A stubborn defender.
  OCO: { pace: 82, cornering: 82, braking: 84, consistency: 82, aggression: 88, defence: 90, wet: 80, tyres: 78, start: 78 },
  // Fearless and quick, but scrappy.
  TSU: { pace: 84, cornering: 83, braking: 80, consistency: 70, aggression: 92, defence: 76, wet: 78, tyres: 72, start: 84 },
  // Solid and sensible, good when it rains.
  HUL: { pace: 80, cornering: 82, braking: 82, consistency: 90, aggression: 74, defence: 84, wet: 86, tyres: 86, start: 84 },
  STR: { pace: 74, cornering: 76, braking: 74, consistency: 72, aggression: 70, defence: 72, wet: 84, tyres: 70, start: 76 },
  // Steady and unspectacular, a fine starter.
  BOT: { pace: 78, cornering: 80, braking: 82, consistency: 92, aggression: 64, defence: 78, wet: 76, tyres: 84, start: 90 },
  // Gentle on tyres, hard to pass.
  PER: { pace: 77, cornering: 78, braking: 76, consistency: 78, aggression: 84, defence: 90, wet: 74, tyres: 92, start: 72 },
  ZHO: { pace: 72, cornering: 74, braking: 74, consistency: 80, aggression: 66, defence: 70, wet: 70, tyres: 76, start: 74 },
  // Brutal in a fight, wild the rest of the time.
  MAG: { pace: 76, cornering: 74, braking: 78, consistency: 62, aggression: 96, defence: 88, wet: 72, tyres: 68, start: 82 },
  // The smooth old hand.
  ROS: { pace: 86, cornering: 87, braking: 86, consistency: 90, aggression: 74, defence: 80, wet: 80, tyres: 86, start: 85 },
};

/** Weights of each stat in a driver's overall rating. */
const OVERALL_WEIGHTS: Record<StatKey, number> = {
  pace: 0.24,
  cornering: 0.2,
  braking: 0.12,
  consistency: 0.14,
  aggression: 0.06,
  defence: 0.06,
  wet: 0.06,
  tyres: 0.08,
  start: 0.04,
};

/** One number, 0-100, for how good a driver is overall. */
export function overallRating(stats: DriverStats): number {
  return Math.round(STAT_KEYS.reduce((sum, key) => sum + stats[key] * OVERALL_WEIGHTS[key], 0));
}
