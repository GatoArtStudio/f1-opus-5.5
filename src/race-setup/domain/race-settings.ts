export type Difficulty = "easy" | "medium" | "hard";
export type GridSlot = "pole" | "middle" | "back" | "random";

/** What the player chooses before a race. */
export interface RaceSettings {
  laps: number;
  rivals: number;
  difficulty: Difficulty;
  gridSlot: GridSlot;
}

export const DEFAULT_RACE_SETTINGS: RaceSettings = {
  laps: 3,
  rivals: 7,
  difficulty: "medium",
  gridSlot: "back",
};

/** Ranges bots are drawn from: cornering skill and top-speed factor. */
export const DIFFICULTY_LEVELS: Record<Difficulty, { skill: [number, number]; topSpeed: [number, number] }> = {
  easy: { skill: [0.8, 0.88], topSpeed: [0.9, 0.95] },
  medium: { skill: [0.88, 0.95], topSpeed: [0.95, 0.99] },
  hard: { skill: [0.95, 1.01], topSpeed: [0.99, 1.02] },
};

export const LAP_CHOICES = [1, 2, 3, 5, 8, 10] as const;
export const RIVAL_CHOICES = [3, 5, 7, 9, 11] as const;
