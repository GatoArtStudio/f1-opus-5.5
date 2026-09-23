import { clamp } from "@/shared/domain/math";
import { createNoise2D, fractalNoise, type Noise2D } from "@/shared/domain/noise";
import type { Circuit } from "./circuit";
import { THEME_PROFILES, type ThemeProfile } from "./circuit-theme";
import { isInStartZone } from "./elevation-profile";

/** Ground stays level with the road this far from the centreline (covers the barriers). */
const FLAT_HALF_WIDTH = 27;
/** Distance over which the ground eases from the road's height to the natural hills. */
const BLEND = 90;
/** The ground sits a little under the road so the two never fight for the same pixels. */
const ROAD_CLEARANCE = 0.3;
const CELL = 128;
/** Samples further apart than this along the lap count as a different stretch of track. */
const SECTION_GAP = 25;
/** How quickly two stretches of track stop influencing the ground between them. */
const SECTION_BLEND = 14;
/** How far the terrain extends beyond the circuit, fading back to sea level at the rim. */
export const TERRAIN_PADDING = 500;
const RIM_FADE = 250;
/** Natural hills are held down around the start straight, where the stands are. */
const START_CLEAR = 40;
const START_FADE = 60;

export interface TerrainExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface NearestSample {
  index: number;
  distance: number;
}

const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/**
 * Height of the ground around a circuit: level with the road near it, easing
 * into seeded natural hills further out. Pure and deterministic per circuit.
 */
export class Terrain {
  readonly extent: TerrainExtent;
  readonly profile: ThemeProfile;
  private readonly noise: Noise2D;
  private readonly cells = new Map<number, number[]>();
  private readonly startZone: Uint8Array;

  constructor(private readonly circuit: Circuit) {
    this.profile = THEME_PROFILES[circuit.theme];
    this.noise = createNoise2D(circuit.seed);

    const { px, pz, n } = circuit;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    this.startZone = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]);
      maxZ = Math.max(maxZ, pz[i]);
      this.startZone[i] = isInStartZone(i * circuit.ds, circuit.length) ? 1 : 0;
      const key = this.key(Math.floor(px[i] / CELL), Math.floor(pz[i] / CELL));
      const cell = this.cells.get(key);
      if (cell) cell.push(i);
      else this.cells.set(key, [i]);
    }
    this.extent = {
      minX: minX - TERRAIN_PADDING,
      maxX: maxX + TERRAIN_PADDING,
      minZ: minZ - TERRAIN_PADDING,
      maxZ: maxZ + TERRAIN_PADDING,
    };
  }

  private key(cx: number, cz: number): number {
    return cx * 100003 + cz;
  }

  private forEachNearby(x: number, z: number, visit: (i: number) => void): void {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.cells.get(this.key(cx + dx, cz + dz));
        if (cell) for (const i of cell) visit(i);
      }
    }
  }

  /** Closest centreline sample, if the track is within about a cell of the point. */
  nearest(x: number, z: number): NearestSample | null {
    const { px, pz } = this.circuit;
    let best = -1, bestD = Infinity;
    this.forEachNearby(x, z, (i) => {
      const d = (x - px[i]) ** 2 + (z - pz[i]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best < 0 ? null : { index: best, distance: Math.sqrt(bestD) };
  }

  /** Height of the natural hills alone, ignoring the road. */
  private hills(x: number, z: number): number {
    const { hills, hillScale } = this.profile;
    const rim = Math.min(x - this.extent.minX, this.extent.maxX - x, z - this.extent.minZ, this.extent.maxZ - z);
    return hills * fractalNoise(this.noise, x / hillScale, z / hillScale, 4) * 1.6 * smooth(rim / RIM_FADE);
  }

  heightAt(x: number, z: number): number {
    const { px, pz, elevation, n } = this.circuit;
    const reach = FLAT_HALF_WIDTH + BLEND;
    let closest = -1, closestD = Infinity, nearestStart = Infinity;
    this.forEachNearby(x, z, (i) => {
      const d = Math.hypot(x - px[i], z - pz[i]);
      if (d < closestD) {
        closestD = d;
        closest = i;
      }
      if (d < nearestStart && this.startZone[i]) nearestStart = d;
    });

    const open = nearestStart > reach ? 1 : smooth((nearestStart - START_CLEAR) / START_FADE);
    const natural = this.hills(x, z) * open;
    if (closestD > reach) return natural;

    // The road's own height under the closest sample, blended with a different
    // section of track only where that one is about as close (between two sections).
    let otherD = Infinity, otherElevation = 0;
    this.forEachNearby(x, z, (i) => {
      const apart = Math.abs(i - closest);
      if (Math.min(apart, n - apart) <= SECTION_GAP) return;
      const d = Math.hypot(x - px[i], z - pz[i]);
      if (d < otherD) {
        otherD = d;
        otherElevation = elevation[i];
      }
    });
    const pull = otherD === Infinity ? 0 : Math.exp(-(((otherD - closestD) / SECTION_BLEND) ** 2));
    const road = (elevation[closest] + pull * otherElevation) / (1 + pull) - ROAD_CLEARANCE;
    return natural + (road - natural) * (1 - smooth((closestD - FLAT_HALF_WIDTH) / BLEND));
  }
}
