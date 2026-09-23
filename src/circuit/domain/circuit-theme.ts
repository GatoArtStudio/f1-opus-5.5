export type CircuitThemeId = "forest" | "ice" | "desert" | "volcano" | "city";

export const THEME_IDS: readonly CircuitThemeId[] = ["forest", "ice", "desert", "volcano", "city"];

/** What a theme asks of the generator and of the terrain (metres). */
export interface ThemeProfile {
  label: string;
  /** Range the peak height of the track's hills is drawn from. */
  elevation: readonly [number, number];
  /** How many tunnels to try to fit. */
  tunnels: readonly [number, number];
  /** Amplitude of the surrounding hills, and their horizontal scale. */
  hills: number;
  hillScale: number;
  /** Height of the water / lava / frozen lakes that fill the basins, if any. */
  liquidLevel: number | null;
}

export const THEME_PROFILES: Record<CircuitThemeId, ThemeProfile> = {
  forest: { label: "Bosque", elevation: [8, 20], tunnels: [0, 2], hills: 9, hillScale: 220, liquidLevel: -1.6 },
  ice: { label: "Hielo", elevation: [10, 26], tunnels: [1, 2], hills: 18, hillScale: 260, liquidLevel: -2.5 },
  desert: { label: "Desierto", elevation: [6, 18], tunnels: [0, 1], hills: 12, hillScale: 300, liquidLevel: null },
  volcano: { label: "Volcán", elevation: [20, 42], tunnels: [1, 2], hills: 28, hillScale: 240, liquidLevel: -3 },
  city: { label: "Ciudad", elevation: [4, 12], tunnels: [1, 3], hills: 2.5, hillScale: 400, liquidLevel: null },
};
