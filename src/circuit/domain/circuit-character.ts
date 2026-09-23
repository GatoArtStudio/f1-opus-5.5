/** How twisty a generated circuit is, from fast and open to tight and technical. */
export type CircuitCharacter = "flowing" | "mixed" | "technical" | "twisty";

export const CHARACTER_LABELS: Record<CircuitCharacter, string> = {
  flowing: "Rápido",
  mixed: "Mixto",
  technical: "Técnico",
  twisty: "Muy sinuoso",
};

/** What a candidate circuit must have to count as this character (distances at the circuit's original scale). */
export interface CharacterTargets {
  /** Bends of radius under 110 m, and how many of them are tight (under 55 m). */
  corners: number;
  tightCorners: number;
  /** Longest run without a bend, away from the start straight (m). */
  longestStraight: number;
}

export interface CharacterSpec {
  /** How often seeds get this character. */
  weight: number;
  /** Control points on the arc, and how many hairpins, chicanes and kinks are worked into it. */
  points: readonly [number, number];
  features: readonly [number, number];
  /** Multiplier on the size of the basic loop; busier circuits need more room. */
  size: readonly [number, number];
  targets: CharacterTargets;
}

export const CHARACTERS: Record<CircuitCharacter, CharacterSpec> = {
  flowing: { weight: 0.15, points: [10, 14], features: [1, 3], size: [1, 1.1], targets: { corners: 5, tightCorners: 1, longestStraight: 900 } },
  mixed: { weight: 0.35, points: [14, 20], features: [4, 6], size: [0.95, 1.1], targets: { corners: 8, tightCorners: 3, longestStraight: 650 } },
  technical: { weight: 0.32, points: [20, 28], features: [7, 11], size: [0.85, 1.05], targets: { corners: 11, tightCorners: 5, longestStraight: 480 } },
  twisty: { weight: 0.18, points: [24, 32], features: [10, 15], size: [0.72, 0.92], targets: { corners: 15, tightCorners: 8, longestStraight: 380 } },
};

/** The next, easier character to fall back on when a seed cannot produce the one it drew. */
export const EASIER: Record<CircuitCharacter, CircuitCharacter | null> = {
  twisty: "technical",
  technical: "mixed",
  mixed: "flowing",
  flowing: null,
};
