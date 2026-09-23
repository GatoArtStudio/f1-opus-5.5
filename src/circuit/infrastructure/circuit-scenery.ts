import type * as THREE from "three";
import type { Circuit } from "@/circuit/domain/circuit";
import { buildKerbs, buildRoad, buildStartLine, type GridSlotMark } from "./track-surface";
import {
  buildBarriers,
  buildGrandstands,
  buildGround,
  buildSky,
  buildStartGantry,
  buildTrees,
  type StartGantry,
} from "./trackside-objects";

export interface CircuitScenery {
  startGantry: StartGantry;
}

/** Builds every static object of the circuit into the scene. */
export function buildCircuitScenery(
  scene: THREE.Scene,
  circuit: Circuit,
  renderer: THREE.WebGLRenderer,
  gridSlots: readonly GridSlotMark[],
): CircuitScenery {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  buildSky(scene);
  buildGround(scene, anisotropy);
  buildRoad(scene, circuit, anisotropy);
  buildKerbs(scene, circuit);
  buildBarriers(scene, circuit, anisotropy);
  buildStartLine(scene, circuit, gridSlots);
  const startGantry = buildStartGantry(scene, circuit);
  buildGrandstands(scene, circuit);
  buildTrees(scene, circuit);
  return { startGantry };
}
