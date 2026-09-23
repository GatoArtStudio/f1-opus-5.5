import { randomBetween, type RandomSource } from "@/shared/domain/math";
import { createSeededRandom } from "@/shared/domain/seeded-random";
import { WEB_GP_CIRCUIT, type CircuitLayout } from "./circuit-layout";
import { addCircuitFeatures } from "./circuit-features";
import { findLayoutIssue, type LayoutLimits } from "./layout-validation";

type Point = readonly [number, number];

/** Calibrated against the hand-made circuit (length 3.8 km, radius 30 m, clearance 95 m). */
const LIMITS: LayoutLimits = { minLength: 2600, maxLength: 6000, minRadius: 28, minClearance: 80 };
const MAX_ATTEMPTS = 300;

/**
 * The start/finish straight is the same on every generated circuit: it runs
 * along +x through the origin, long enough for the grid behind the line and
 * the grandstands beside it. The rest of the lap is an arc on the right-hand
 * side (+z) that comes back to the start of the straight.
 */
const STRAIGHT: readonly Point[] = [[-320, 0], [-160, 0], [0, 0], [160, 0], [320, 0]];

function buildCandidate(name: string, random: RandomSource): CircuitLayout {
  const halfSpan = randomBetween([500, 760], random);
  const height = randomBetween([260, 580], random);
  const centreX = randomBetween([-40, 40], random);
  const count = Math.round(randomBetween([10, 16], random));

  // Slow undulations make long sweepers; dents and bulges make hairpins and kinks.
  const waves = [0, 1, 2].map(() => ({
    frequency: randomBetween([1, 5], random),
    phase: randomBetween([0, Math.PI * 2], random),
    amplitude: randomBetween([0.04, 0.16], random),
  }));
  const dents = new Map<number, number>();
  const featureCount = Math.floor(randomBetween([1, 4.5], random));
  for (let f = 0; f < featureCount; f++) {
    const bulge = random() < 0.35;
    dents.set(1 + Math.floor(random() * (count - 2)), bulge ? randomBetween([1.2, 1.5], random) : randomBetween([0.38, 0.65], random));
  }

  const arc: Point[] = [];
  for (let k = 0; k < count; k++) {
    const slot = (k + 0.5) / count;
    const angle = Math.PI * (slot + (random() - 0.5) * (0.6 / count));
    let radius = 1 + (random() - 0.5) * 0.28;
    for (const w of waves) radius += w.amplitude * Math.sin(w.frequency * angle + w.phase);
    radius *= dents.get(k) ?? 1;
    arc.push([centreX + Math.cos(angle) * halfSpan * radius, Math.sin(angle) * height * radius]);
  }
  // The arc runs from +x round to -x, i.e. the direction of travel after the straight.
  return {
    name,
    width: 16,
    kerbWidth: 1.8,
    runoff: 14,
    sampleSpacing: 2,
    controlPoints: [...STRAIGHT, ...arc],
  };
}

/**
 * Deterministic: the same seed always yields the same circuit, theme included. Candidates are
 * drawn until one passes validation; if none does, the hand-made circuit is
 * returned so a race can always start.
 */
export function generateCircuitLayout(seed: string): CircuitLayout {
  const name = `Circuito ${seed}`;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const layout = buildCandidate(name, createSeededRandom(`${seed}#${attempt}`));
    if (findLayoutIssue(layout, LIMITS) === null) return addCircuitFeatures(layout, seed);
  }
  return addCircuitFeatures({ ...WEB_GP_CIRCUIT, name }, seed);
}
