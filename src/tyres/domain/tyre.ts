import { clamp } from "@/shared/domain/math";
import type { TrackConditions } from "@/weather/domain/weather";

export type Compound = "soft" | "medium" | "hard" | "intermediate" | "wet" | "snow";

export const COMPOUNDS: readonly Compound[] = ["soft", "medium", "hard", "intermediate", "wet", "snow"];

export interface CompoundSpec {
  label: string;
  /** Letter shown on the tyre badge. */
  short: string;
  color: number;
  note: string;
  /** Grip on a dry track at its best temperature, relative to a fresh medium (1). */
  dryGrip: number;
  /** Wear per kilometre on a fresh, well-matched tyre (1 = worn out). */
  wearPerKm: number;
  /** Track temperature it works best at (°C), and how far it can stray before losing grip. */
  optimalTemp: number;
  tempTolerance: number;
}

export const COMPOUND_SPECS: Record<Compound, CompoundSpec> = {
  soft: { label: "Blanda", short: "S", color: 0xe10600, note: "Máximo agarre en seco, dura poco.", dryGrip: 1.05, wearPerKm: 0.05, optimalTemp: 32, tempTolerance: 14 },
  medium: { label: "Media", short: "M", color: 0xffd200, note: "El equilibrio en seco.", dryGrip: 1, wearPerKm: 0.028, optimalTemp: 38, tempTolerance: 16 },
  hard: { label: "Dura", short: "H", color: 0xf0f0f0, note: "Aguanta mucho, con menos agarre. Mejor con calor.", dryGrip: 0.955, wearPerKm: 0.016, optimalTemp: 46, tempTolerance: 18 },
  intermediate: { label: "Intermedia", short: "I", color: 0x2bd15c, note: "Pista húmeda. En seco se destruye.", dryGrip: 0.88, wearPerKm: 0.03, optimalTemp: 22, tempTolerance: 18 },
  wet: { label: "Lluvia", short: "W", color: 0x2a8bff, note: "Lluvia fuerte o charcos. Muy lenta en seco.", dryGrip: 0.8, wearPerKm: 0.03, optimalTemp: 16, tempTolerance: 20 },
  snow: { label: "Nieve", short: "N", color: 0xb07cff, note: "Con clavos: la mejor sobre nieve y con frío.", dryGrip: 0.8, wearPerKm: 0.025, optimalTemp: -2, tempTolerance: 26 },
};

/** Piecewise-linear table of grip against water on the track. */
type Curve = readonly (readonly [number, number])[];

const WATER_CURVES: Partial<Record<Compound, Curve>> = {
  intermediate: [[0, 0.88], [0.25, 0.98], [0.5, 1], [0.7, 0.9], [0.9, 0.62], [1, 0.5]],
  wet: [[0, 0.8], [0.25, 0.86], [0.5, 0.95], [0.7, 1], [0.9, 1], [1, 0.95]],
  snow: [[0, 0.8], [0.25, 0.86], [0.5, 0.85], [0.8, 0.8], [1, 0.7]],
};

function readCurve(curve: Curve, x: number): number {
  for (let k = 1; k < curve.length; k++) {
    if (x <= curve[k][0]) {
      const [x0, y0] = curve[k - 1], [x1, y1] = curve[k];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Slicks never lose all their grip, even in a downpour: cars slow to a crawl rather than stopping dead. */
const SLICK_MIN_WATER_GRIP = 0.3;

/** Grip from the water on the road alone. Slicks are fine when dry and fall off quickly when wet. */
function waterGrip(compound: Compound, water: number): number {
  const curve = WATER_CURVES[compound];
  if (curve) return readCurve(curve, water);
  return COMPOUND_SPECS[compound].dryGrip * clamp(1 - 1.3 * Math.max(0, water - 0.04) ** 0.9, SLICK_MIN_WATER_GRIP, 1);
}

const WEAR_CLIFF = 0.85;
const MAX_WEAR = 1.3;

/** Grip of a tyre relative to a fresh medium on a dry track, 1 = that reference. */
export function tyreGrip(compound: Compound, wear: number, conditions: TrackConditions): number {
  const spec = COMPOUND_SPECS[compound];
  const cover = compound === "snow" ? 0.1 : 0.45;
  const temperature = 1 - clamp(0.006 * (Math.abs(conditions.temperature - spec.optimalTemp) - spec.tempTolerance), 0, 0.25);
  const worn = 1 - 0.3 * Math.min(wear, MAX_WEAR) ** 1.6 - Math.max(0, wear - WEAR_CLIFF);
  return waterGrip(compound, conditions.water) * (1 - cover * conditions.loose) * temperature * Math.max(0.35, worn);
}

/** How much faster a tyre wears in these conditions, before the driving load. */
function wearMultiplier(compound: Compound, conditions: TrackConditions): number {
  const spec = COMPOUND_SPECS[compound];
  const { water, loose, temperature } = conditions;
  let mismatch = 1;
  if (compound === "intermediate") mismatch += 2.5 * clamp((0.2 - water) / 0.2, 0, 1);
  if (compound === "wet") mismatch += 4 * clamp((0.45 - water) / 0.45, 0, 1);
  if (compound === "snow") mismatch += 3 * clamp((0.25 - loose) / 0.25, 0, 1) * clamp((0.3 - water) / 0.3, 0, 1);
  const heat = 1 + 0.03 * Math.max(0, temperature - spec.optimalTemp - spec.tempTolerance / 2);
  return mismatch * heat;
}

/** One set of tyres on a car. */
export class Tyre {
  wear = 0;

  constructor(readonly compound: Compound) {}

  grip(conditions: TrackConditions): number {
    return tyreGrip(this.compound, this.wear, conditions);
  }

  /** Wears the tyre for `dt` seconds at `speed` (m/s) with `load` (0-1+) of its grip in use. */
  advance(dt: number, speed: number, load: number, conditions: TrackConditions): void {
    const perMetre = COMPOUND_SPECS[this.compound].wearPerKm / 1000;
    this.wear = Math.min(MAX_WEAR, this.wear + Math.abs(speed) * dt * perMetre * wearMultiplier(this.compound, conditions) * (0.5 + load));
  }
}

export interface CompoundScore {
  compound: Compound;
  /** Average grip over the stint, including wear. */
  score: number;
  /** The tyre would be worn out before the stint ends. */
  wornOut: boolean;
}

/**
 * Average grip a tyre would give over a stint of `laps` laps starting at wear
 * `wear`, in the given conditions. `wetter` shifts the water level to allow
 * for rain that is expected to arrive.
 */
export function stintScore(compound: Compound, wear: number, conditions: TrackConditions, laps: number, lapKm: number, wetter = 0): CompoundScore {
  const expected: TrackConditions = { ...conditions, water: clamp(conditions.water + wetter, 0, 1) };
  const km = Math.max(0.5, laps) * lapKm;
  const wearEnd = Math.min(MAX_WEAR, wear + km * COMPOUND_SPECS[compound].wearPerKm * wearMultiplier(compound, expected) * 0.9);
  const average = (tyreGrip(compound, wear, expected) + 2 * tyreGrip(compound, (wear + wearEnd) / 2, expected) + tyreGrip(compound, wearEnd, expected)) / 4;
  const wornOut = wearEnd >= 1;
  return { compound, score: wornOut ? average * 0.93 : average, wornOut };
}

/** Ranks fresh compounds for a stint of `laps` laps, best first. */
export function rankCompounds(conditions: TrackConditions, laps: number, lapKm: number, wetter = 0): CompoundScore[] {
  return COMPOUNDS.map((compound) => stintScore(compound, 0, conditions, laps, lapKm, wetter)).sort((a, b) => b.score - a.score);
}

export function bestCompound(conditions: TrackConditions, laps: number, lapKm: number, wetter = 0): Compound {
  return rankCompounds(conditions, laps, lapKm, wetter)[0].compound;
}
