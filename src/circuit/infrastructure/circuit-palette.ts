import type { CircuitThemeId } from "@/circuit/domain/circuit-theme";

export type PropKind = "pine" | "snow-pine" | "ice-spike" | "cactus" | "dead-tree" | "rock";

export interface Liquid {
  color: number;
  /** Lava glows on its own; water and ice reflect the light. */
  glows: boolean;
  roughness: number;
}

/** Everything that makes a theme look like itself. Colours are 0xRRGGBB. */
export interface CircuitPalette {
  sky: { top: number; horizon: number; below: number };
  fog: { color: number; near: number; far: number };
  light: { hemiSky: number; hemiGround: number; hemiIntensity: number; sun: number; sunIntensity: number; exposure: number };
  /** Ground colours: open ground (two tones), high ground, steep slopes and the shore of the liquid. */
  ground: { a: number; b: number; high: number; rock: number; shore: number };
  asphalt: string;
  kerb: readonly [number, number];
  liquid: Liquid | null;
  /** Distant mountain ring. */
  mountains: { color: number; cap: number | null; count: number; height: readonly [number, number] };
  props: readonly { kind: PropKind; count: number }[];
  /** Blocks of buildings and street lamps along the track. */
  buildings: boolean;
  /** Tunnel and hill surfaces. */
  tunnelHill: number;
  /** A volcano with a glowing crater on the horizon. */
  volcano: boolean;
}

export const PALETTES: Record<CircuitThemeId, CircuitPalette> = {
  forest: {
    sky: { top: 0x2f6fc4, horizon: 0xcfe3f2, below: 0x9fb8a0 },
    fog: { color: 0xcfe3f2, near: 350, far: 2200 },
    light: { hemiSky: 0xdcecff, hemiGround: 0x3d5a2a, hemiIntensity: 1.1, sun: 0xfff4e0, sunIntensity: 2.4, exposure: 1.05 },
    ground: { a: 0x4b7d2e, b: 0x5d8f36, high: 0x7d8f5a, rock: 0x6c6a63, shore: 0x9a8b62 },
    asphalt: "#3a3b3e",
    kerb: [0xd4161c, 0xf2f2f2],
    liquid: { color: 0x2a6fa0, glows: false, roughness: 0.15 },
    mountains: { color: 0x5a7a6a, cap: null, count: 22, height: [120, 300] },
    props: [{ kind: "pine", count: 900 }, { kind: "rock", count: 120 }],
    buildings: false,
    tunnelHill: 0x4b7d2e,
    volcano: false,
  },
  ice: {
    sky: { top: 0x4a86c8, horizon: 0xdbe9f5, below: 0xc8d8e6 },
    fog: { color: 0xdbe9f5, near: 260, far: 1900 },
    light: { hemiSky: 0xe4f0ff, hemiGround: 0x8fa6bd, hemiIntensity: 1.3, sun: 0xf3f8ff, sunIntensity: 2.2, exposure: 1.1 },
    ground: { a: 0xe9f1f8, b: 0xd4e4f2, high: 0xffffff, rock: 0x8c9db0, shore: 0xb5d3e8 },
    asphalt: "#3d4249",
    kerb: [0x1e78d2, 0xf2f6fa],
    liquid: { color: 0x8cd0ec, glows: false, roughness: 0.05 },
    mountains: { color: 0x8fa9c4, cap: 0xffffff, count: 24, height: [180, 420] },
    props: [{ kind: "snow-pine", count: 520 }, { kind: "ice-spike", count: 260 }, { kind: "rock", count: 80 }],
    buildings: false,
    tunnelHill: 0xdfeaf4,
    volcano: false,
  },
  desert: {
    sky: { top: 0x3f86d0, horizon: 0xf4dcb0, below: 0xd9b884 },
    fog: { color: 0xf0d6a8, near: 380, far: 2400 },
    light: { hemiSky: 0xffe8c0, hemiGround: 0xa87a44, hemiIntensity: 1.15, sun: 0xfff0d0, sunIntensity: 2.7, exposure: 1.08 },
    ground: { a: 0xd8b070, b: 0xcfa45f, high: 0xe6c288, rock: 0xa8623a, shore: 0xc9985a },
    asphalt: "#46403a",
    kerb: [0xd4161c, 0xf2f2f2],
    liquid: null,
    mountains: { color: 0xb5653a, cap: null, count: 18, height: [90, 260] },
    props: [{ kind: "cactus", count: 300 }, { kind: "rock", count: 320 }],
    buildings: false,
    tunnelHill: 0xc7854f,
    volcano: false,
  },
  volcano: {
    sky: { top: 0x2a1418, horizon: 0xd8623a, below: 0x3a1c14 },
    fog: { color: 0x8a3a24, near: 220, far: 1700 },
    light: { hemiSky: 0xe6a688, hemiGround: 0x4a2a22, hemiIntensity: 1.25, sun: 0xffbe8a, sunIntensity: 2.1, exposure: 1.05 },
    ground: { a: 0x2c2624, b: 0x3a302c, high: 0x4a403c, rock: 0x1c1817, shore: 0x5a2a1a },
    asphalt: "#2b2a2d",
    kerb: [0xff5a1a, 0x1a1a1a],
    liquid: { color: 0xff5a14, glows: true, roughness: 1 },
    mountains: { color: 0x2a2220, cap: null, count: 22, height: [140, 340] },
    props: [{ kind: "dead-tree", count: 260 }, { kind: "rock", count: 420 }],
    buildings: false,
    tunnelHill: 0x2c2624,
    volcano: true,
  },
  city: {
    sky: { top: 0x1d2a5c, horizon: 0xf2a874, below: 0x4a3a4c },
    fog: { color: 0xc98a70, near: 300, far: 2000 },
    light: { hemiSky: 0xd8d0e0, hemiGround: 0x4a4560, hemiIntensity: 1.35, sun: 0xffc79a, sunIntensity: 1.9, exposure: 1.05 },
    ground: { a: 0x55585e, b: 0x62666c, high: 0x6c7076, rock: 0x44464b, shore: 0x55585e },
    asphalt: "#333438",
    kerb: [0xf2c200, 0x1a1a1a],
    liquid: null,
    mountains: { color: 0x3a3450, cap: null, count: 0, height: [0, 0] },
    props: [{ kind: "pine", count: 70 }],
    buildings: true,
    tunnelHill: 0x55585e,
    volcano: false,
  },
};
