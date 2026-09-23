import type { RaceCar } from "@/race-car/domain/race-car";
import { rankCompounds, stintScore, type Compound } from "./tyre";

/** Pit stops cost roughly this many seconds against staying out (slow lane, stop, rejoining). */
export const PIT_TIME_LOSS = 16;
/** Rough speed used to turn laps into seconds. */
const AVERAGE_SPEED = 52;

export type PitReason = "weather" | "wear" | "mandatory";

export interface PitDecision {
  compound: Compound;
  reason: PitReason;
  /** Seconds the change is expected to save over the rest of the race (0 for a mandatory stop). */
  seconds: number;
}

/** The F1 rule of using two different dry compounds in a dry race, as it stands for one car. */
export interface MandatoryStop {
  needed: boolean;
  /** Laps that must have been run before the stop is asked for. */
  fromLaps: number;
  /** Dry compounds the car has already used. */
  used: ReadonlySet<Compound>;
}

export const DRY_COMPOUNDS: readonly Compound[] = ["soft", "medium", "hard"];
export const isDryCompound = (compound: Compound): boolean => DRY_COMPOUNDS.includes(compound);

const isWetTrack = (car: RaceCar) => car.conditions.water > 0.12 || car.conditions.loose > 0.2;

/**
 * Whether a car should come in for tyres now, and for which. Weighs the grip
 * a fresh set would give over the rest of the race against the time lost in
 * the pits; also honours the mandatory-stop rule when the track is dry.
 */
export function decidePit(car: RaceCar, lapsLeft: number, lapsRun: number, lapKm: number, rule: MandatoryStop): PitDecision | null {
  if (lapsLeft < 1.2) return null;
  const { conditions, tyre } = car;
  const ranking = rankCompounds(conditions, Math.max(0, lapsLeft - 0.25), lapKm);
  const best = ranking[0];
  const stay = stintScore(tyre.compound, tyre.wear, conditions, lapsLeft, lapKm);
  const remaining = (lapsLeft * lapKm * 1000) / AVERAGE_SPEED;
  const seconds = (Math.sqrt(best.score / Math.max(stay.score, 0.05)) - 1) * remaining;
  if (best.compound !== tyre.compound && seconds >= PIT_TIME_LOSS) {
    const mismatch = isWetTrack(car) === isDryCompound(tyre.compound);
    return { compound: best.compound, reason: mismatch ? "weather" : "wear", seconds };
  }

  if (rule.needed && !isWetTrack(car) && lapsRun >= rule.fromLaps) {
    const other = ranking.find((r) => isDryCompound(r.compound) && !rule.used.has(r.compound));
    if (other) return { compound: other.compound, reason: "mandatory", seconds: 0 };
  }
  return null;
}
