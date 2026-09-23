import type * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { Terrain } from "@/circuit/domain/terrain";
import { createSeededRandom } from "@/shared/domain/seeded-random";
import { buildBuildings, buildStreetLamps } from "./buildings";
import { PALETTES, type CircuitPalette } from "./circuit-palette";
import { buildHorizon } from "./horizon";
import { buildProps } from "./props";
import { buildTerrain } from "./terrain-mesh";
import { buildKerbs, buildRoad, buildStartLine, type GridSlotMark } from "./track-surface";
import { buildBarriers, buildGrandstands, buildSky, buildStartGantry, type StartGantry } from "./trackside-objects";
import { buildTunnels } from "./tunnel-model";

export interface CircuitScenery {
  startGantry: StartGantry;
  /** Sky, fog and light settings the view should apply for this theme. */
  palette: CircuitPalette;
}

/** Builds every static object of the circuit into `root`; the same circuit always looks the same. */
export function buildCircuitScenery(
  root: THREE.Object3D,
  circuit: Circuit,
  renderer: THREE.WebGLRenderer,
  gridSlots: readonly GridSlotMark[],
): CircuitScenery {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const palette = PALETTES[circuit.theme];
  const terrain = new Terrain(circuit);
  const random = createSeededRandom(`${circuit.seed}#scenery`);

  buildSky(root, palette.sky);
  buildTerrain(root, terrain, palette, anisotropy);
  buildHorizon(root, terrain, palette, random);
  buildRoad(root, circuit, palette, anisotropy);
  buildKerbs(root, circuit, palette);
  buildBarriers(root, circuit, anisotropy);
  buildStartLine(root, circuit, gridSlots);
  const startGantry = buildStartGantry(root, circuit);
  buildGrandstands(root, circuit);
  buildTunnels(root, circuit, palette, anisotropy);
  buildProps(root, circuit, terrain, palette, random);
  if (palette.buildings) {
    buildBuildings(root, circuit, terrain, random, anisotropy);
    buildStreetLamps(root, circuit);
  }
  return { startGantry, palette };
}
