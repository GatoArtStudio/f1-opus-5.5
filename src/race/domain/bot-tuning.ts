import type { DrivingStyle } from "@/ai-driver/domain/bot-driver";
import type { DifficultyLevel } from "@/race-setup/domain/race-settings";
import { clamp, type RandomSource } from "@/shared/domain/math";
import { STAT_KEYS, type DriverStats } from "./driver-stats";

/** Everything a driver's stats and the difficulty decide about one bot in one race. */
export interface BotTuning {
  /** Car and driver pace (see `DifficultyLevel`). */
  skill: number;
  topSpeed: number;
  grip: number;
  engine: number;
  /** How the bot drives, and how quickly it reacts to changes in the weather. */
  style: DrivingStyle;
  /** How fast its tyres wear compared with the standard (1). */
  tyreWear: number;
  /** Multiplier on its delay before reacting to a change of weather (1 = average). */
  reaction: number;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Stats where the field's worst driver counts as 0 and its best as 1. */
const WORST = 55, BEST = 97;
const quality = (stat: number) => clamp((stat - WORST) / (BEST - WORST), 0, 1);

/** Standard normal random number. */
function gaussian(random: RandomSource): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/**
 * A driver's stats for this race: the usual ones, moved a little by a good or bad day
 * that touches everything and by some noise on each. The difficulty decides how much.
 */
export function statsForRace(base: DriverStats, level: DifficultyLevel, random: RandomSource): DriverStats {
  const form = gaussian(random) * level.variation.form;
  const stats = { ...base };
  for (const key of STAT_KEYS) stats[key] = clamp(base[key] + form + gaussian(random) * level.variation.each, 30, 99);
  return stats;
}

/**
 * Turns a driver's stats into the numbers that make the bot faster or slower, cleaner
 * or sloppier. The level's ranges are the band the driver lands in: the best driver
 * gets the top of it and the worst the bottom.
 */
export function tuneBot(stats: DriverStats, level: DifficultyLevel, random: RandomSource): BotTuning {
  const q = {
    pace: quality(stats.pace),
    cornering: quality(stats.cornering),
    braking: quality(stats.braking),
    consistency: quality(stats.consistency),
    aggression: quality(stats.aggression),
    defence: quality(stats.defence),
    wet: quality(stats.wet),
    tyres: quality(stats.tyres),
    start: quality(stats.start),
  };
  return {
    skill: lerp(level.skill[0], level.skill[1], q.cornering),
    topSpeed: lerp(level.topSpeed[0], level.topSpeed[1], q.pace),
    grip: lerp(level.grip[0], level.grip[1], (q.pace + q.cornering) / 2),
    engine: lerp(level.engine[0], level.engine[1], q.pace),
    style: {
      wobble: level.wobble * lerp(1.6, 0.4, q.consistency),
      braking: clamp(level.braking + (q.braking - 0.5) * 0.12, 0.6, 0.96),
      defence: clamp(level.defence * lerp(0.78, 1.04, q.defence), 0.4, 0.99),
      aggression: q.aggression,
      wetSkill: q.wet,
      mistakesPerLap: level.mistakes * lerp(1, 0.1, q.consistency),
      startDelay: lerp(0.4, 0, q.start) + random() * 0.08,
      detection: lerp(1.5, 0.6, q.defence),
    },
    tyreWear: lerp(1.2, 0.8, q.tyres),
    reaction: lerp(1.5, 0.5, q.tyres),
  };
}
