import { DEFAULT_CIRCUIT_SELECTION, type CircuitSelection } from "@/circuit/domain/circuit-selection";
import type { Compound } from "@/tyres/domain/tyre";

export type Difficulty = "easy" | "medium" | "hard";
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

/** Ranges bots are drawn from: cornering skill and top-speed factor. */
export const DIFFICULTY_LEVELS: Record<Difficulty, { skill: [number, number]; topSpeed: [number, number] }> = {
  easy: { skill: [0.8, 0.88], topSpeed: [0.9, 0.95] },
  medium: { skill: [0.88, 0.95], topSpeed: [0.95, 0.99] },
  hard: { skill: [0.95, 1.01], topSpeed: [0.99, 1.02] },
};

export const LAP_CHOICES = [1, 2, 3, 5, 8, 10] as const;
export const RIVAL_CHOICES = [3, 5, 7, 9, 11] as const;
