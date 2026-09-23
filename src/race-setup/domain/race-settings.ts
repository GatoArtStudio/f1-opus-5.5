import { DEFAULT_CIRCUIT_SELECTION, type CircuitSelection } from "@/circuit/domain/circuit-selection";
import type { Compound } from "@/tyres/domain/tyre";

export type Difficulty = "easy" | "medium" | "hard" | "extreme";
export type GridSlot = "pole" | "middle" | "back" | "random";

/** What the player chooses before a race. */
export interface RaceSettings {
  laps: number;
  rivals: number;
  difficulty: Difficulty;
  gridSlot: GridSlot;
  circuit: CircuitSelection;
  /** Tyres to start on; "auto" fits the best set for the conditions. */
  startTyre: Compound | "auto";
  /** F1 rule: use two different dry compounds in a dry race (a 20 s penalty otherwise). Applies from 3 laps. */
  mandatoryStop: boolean;
}

export const DEFAULT_RACE_SETTINGS: RaceSettings = {
  laps: 3,
  rivals: 7,
  difficulty: "medium",
  gridSlot: "back",
  circuit: DEFAULT_CIRCUIT_SELECTION,
  startTyre: "auto",
  mandatoryStop: true,
};

type Range = readonly [number, number];

/**
 * What the bots of a difficulty are like. Each bot draws its numbers from these ranges.
 * "Hard" bots already drive at the limit of the car, so "extreme" ones also have a
 * better car, drive more cleanly and push harder when the player pulls away.
 */
export interface DifficultyLevel {
  /** Share of the car's cornering limit the bot uses, and its top speed. */
  skill: Range;
  topSpeed: Range;
  /** Extra tyre grip and engine power of the bot's car (1 = the same car as the player's). */
  grip: Range;
  engine: Range;
  /** Sideways drift of the line (m) and share of the car's braking used. */
  wobble: number;
  braking: number;
  /** Chance of moving out of the way of a car drafting it. */
  defence: number;
  /** Bots far behind the player get a boost, up to this share of extra grip and power (0 = none). */
  catchUp: number;
}

const NORMAL_CAR = { grip: [1, 1], engine: [1, 1], wobble: 0.5, braking: 0.8, defence: 0.85, catchUp: 0 } as const;

export const DIFFICULTY_LEVELS: Record<Difficulty, DifficultyLevel> = {
  easy: { ...NORMAL_CAR, skill: [0.8, 0.88], topSpeed: [0.9, 0.95] },
  medium: { ...NORMAL_CAR, skill: [0.88, 0.95], topSpeed: [0.95, 0.99] },
  hard: { ...NORMAL_CAR, skill: [0.95, 1.01], topSpeed: [0.99, 1.02] },
  extreme: {
    skill: [0.99, 1.02],
    topSpeed: [1.04, 1.07],
    grip: [1.04, 1.07],
    engine: [1.05, 1.1],
    wobble: 0.15,
    braking: 0.92,
    defence: 0.97,
    catchUp: 1,
  },
};

export const LAP_CHOICES = [1, 2, 3, 5, 8, 10] as const;
export const RIVAL_CHOICES = [3, 5, 7, 9, 11, 15, 19] as const;
