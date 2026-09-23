import { generateCircuitLayout } from "./circuit-generator";
import { scaleLayout, WEB_GP_CIRCUIT, type CircuitLayout } from "./circuit-layout";

/** Hand-made circuits offered in the menu. */
export const PRESET_CIRCUITS = [{ id: "web-gp", name: WEB_GP_CIRCUIT.name, layout: WEB_GP_CIRCUIT }] as const;

export type PresetCircuitId = (typeof PRESET_CIRCUITS)[number]["id"];

/** Which circuit to race on: a ready-made one, or one generated from a seed. */
export type CircuitSelection =
  | { kind: "preset"; id: PresetCircuitId }
  | { kind: "generated"; seed: string };

export const DEFAULT_CIRCUIT_SELECTION: CircuitSelection = { kind: "preset", id: PRESET_CIRCUITS[0].id };

export function resolveCircuitLayout(selection: CircuitSelection): CircuitLayout {
  if (selection.kind === "generated") return generateCircuitLayout(selection.seed);
  return scaleLayout((PRESET_CIRCUITS.find((p) => p.id === selection.id) ?? PRESET_CIRCUITS[0]).layout);
}

export function isSameCircuitSelection(a: CircuitSelection, b: CircuitSelection): boolean {
  if (a.kind === "generated") return b.kind === "generated" && a.seed === b.seed;
  return b.kind === "preset" && a.id === b.id;
}
