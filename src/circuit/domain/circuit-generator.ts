import { randomBetween, type RandomSource } from "@/shared/domain/math";
import { createSeededRandom } from "@/shared/domain/seeded-random";
import { CHARACTERS, EASIER, type CircuitCharacter } from "./circuit-character";
import { scaleLayout, WEB_GP_CIRCUIT, type CircuitLayout } from "./circuit-layout";
import { addCircuitFeatures } from "./circuit-features";
import { findLayoutIssue, type LayoutLimits } from "./layout-validation";

type Point = readonly [number, number];

/**
 * Limits at the circuit's original size (it is enlarged afterwards). Bends may be tighter than
 * on the hand-made circuit (radius 30 m, clearance 95 m), since the map is big and the point is
 * to have real hairpins.
 */
export const LIMITS: LayoutLimits = { minLength: 2600, maxLength: 6000, minRadius: 18, minClearance: 64 };
const ATTEMPTS_PER_CHARACTER = 160;
/** Number of loop points the per-point noise was tuned for. */
const BASE_POINTS = 12;

/**
 * The start/finish straight is the same on every generated circuit: it runs along +x with the
 * start line in the middle, long enough for the grid, the pit lane and the grandstands. The rest
 * of the lap is an arc on the right-hand side (+z) that comes back to the start of the straight.
 */
const STRAIGHT_BEFORE_LINE: readonly Point[] = [[-320, 0], [-160, 0]];
const STRAIGHT_FROM_LINE: readonly Point[] = [[0, 0], [160, 0], [320, 0]];

/** A point of the basic loop: an angle round it (0 to PI) and how far out it sits (1 = the ellipse itself). */
interface LoopPoint {
  angle: number;
  radius: number;
}

function pickCharacter(seed: string): CircuitCharacter {
  const random = createSeededRandom(`${seed}#character`);
  let roll = random();
  for (const [name, spec] of Object.entries(CHARACTERS) as [CircuitCharacter, (typeof CHARACTERS)[CircuitCharacter]][]) {
    roll -= spec.weight;
    if (roll <= 0) return name;
  }
  return "mixed";
}

/** Slow undulations of the basic loop make long sweepers between the features. */
function loopPoints(count: number, random: RandomSource): LoopPoint[] {
  const waves = [0, 1, 2].map(() => ({
    frequency: randomBetween([1, 5], random),
    phase: randomBetween([0, Math.PI * 2], random),
    amplitude: randomBetween([0.04, 0.16], random),
  }));
  const points: LoopPoint[] = [];
  for (let k = 0; k < count; k++) {
    const angle = Math.PI * ((k + 0.5) / count + (random() - 0.5) * (0.6 / count));
    // Per-point noise shrinks as the points get closer, or busy circuits would zigzag into impossible bends.
    let radius = 1 + (random() - 0.5) * 0.28 * Math.min(1, (BASE_POINTS / count) ** 1.6);
    for (const w of waves) radius += w.amplitude * Math.min(1, BASE_POINTS / count) * Math.sin(w.frequency * angle + w.phase);
    points.push({ angle, radius });
  }
  return points;
}

const towards = (from: Point, to: Point): Point => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};
const along = (p: Point, direction: Point, distance: number): Point => [p[0] + direction[0] * distance, p[1] + direction[1] * distance];
const middle = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Works hairpins, chicanes and kinks into the loop. Everything is offset sideways from the direction
 * of travel, so the path never doubles back on itself. A hairpin is a spike out of the loop (or into it)
 * that the track goes round, as deep as its width so the turn at the tip is tight but not a needle; a
 * chicane is an S, with the next points swinging to alternate sides.
 */
function addFeatures(points: Point[], wanted: number, random: RandomSource): Point[] {
  const taken = new Set<number>();
  const plan: { at: number; kind: "hairpin" | "spike-out" | "spike-in" | "chicane" | "kink" }[] = [];
  for (let attempt = 0; plan.length < wanted && attempt < wanted * 8; attempt++) {
    const at = 1 + Math.floor(random() * (points.length - 4));
    if ([at - 1, at, at + 1, at + 2].some((k) => taken.has(k))) continue;
    [at - 1, at, at + 1].forEach((k) => taken.add(k));
    const roll = random();
    plan.push({ at, kind: roll < 0.2 ? "hairpin" : roll < 0.4 ? "spike-out" : roll < 0.58 ? "spike-in" : roll < 0.82 ? "chicane" : "kink" });
  }

  // The loop runs counter-clockwise, so the outward side is the right-hand one.
  const outward = (k: number): Point => {
    const t = towards(points[k - 1], points[k + 1]);
    return [t[1], -t[0]];
  };
  const replaced = new Map<number, Point[]>();
  const moved = new Map<number, Point>();
  for (const { at, kind } of plan) {
    const before = points[at - 1], here = points[at], after = points[at + 1];
    const width = Math.hypot(after[0] - before[0], after[1] - before[1]);
    const normal = outward(at);
    if (kind === "hairpin") {
      // A narrow U out of (or into) the loop: a straight in, a 180 degree turn and a straight back.
      const half = randomBetween([38, 56], random);
      const length = randomBetween([130, 300], random);
      const side = random() < 0.5 ? 1 : -1;
      const tangent = towards(before, after);
      const at2 = (across: number, out: number): Point => [
        here[0] + tangent[0] * across + normal[0] * out * side,
        here[1] + tangent[1] * across + normal[1] * out * side,
      ];
      const top = length - half; // where the round tip starts
      const tip = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI].map(
        (theta): Point => at2(-Math.cos(theta) * half, top + Math.sin(theta) * half),
      );
      replaced.set(at, [at2(-half, 0), at2(-half, top * 0.5), ...tip, at2(half, top * 0.5), at2(half, 0)]);
    } else if (kind === "spike-out" || kind === "spike-in") {
      const depth = width * randomBetween([0.4, 0.68], random) * (kind === "spike-out" ? 1 : -1);
      replaced.set(at, [
        along(middle(before, here), normal, depth * 0.62),
        along(here, normal, depth),
        along(middle(here, after), normal, depth * 0.62),
      ]);
    } else if (kind === "chicane") {
      const swing = width * randomBetween([0.18, 0.28], random) * (random() < 0.5 ? 1 : -1);
      moved.set(at, along(here, normal, swing));
      if (at + 2 < points.length - 1) moved.set(at + 1, along(points[at + 1], outward(at + 1), -swing));
    } else {
      moved.set(at, along(here, normal, width * randomBetween([0.2, 0.35], random) * (random() < 0.5 ? 1 : -1)));
    }
  }
  return points.flatMap((p, k) => replaced.get(k) ?? [moved.get(k) ?? p]);
}

export function buildCandidate(name: string, character: CircuitCharacter, random: RandomSource): CircuitLayout {
  const spec = CHARACTERS[character];
  const size = randomBetween(spec.size, random);
  const halfSpan = randomBetween([500, 760], random) * size;
  const height = randomBetween([260, 580], random) * size;
  const centreX = randomBetween([-40, 40], random);
  const count = Math.round(randomBetween(spec.points, random));
  const features = Math.round(randomBetween(spec.features, random));

  const loop = loopPoints(count, random).map(
    ({ angle, radius }): Point => [centreX + Math.cos(angle) * halfSpan * radius, Math.sin(angle) * height * radius],
  );
  // The lap starts at the start line, in the middle of the straight, and runs round the loop back to it.
  return {
    name,
    width: 16,
    kerbWidth: 1.8,
    runoff: 14,
    sampleSpacing: 2,
    controlPoints: [...STRAIGHT_FROM_LINE, ...addFeatures(loop, features, random), ...STRAIGHT_BEFORE_LINE],
    character,
  };
}

/**
 * Deterministic: the same seed always yields the same circuit, theme included. Each seed has a
 * character (fast, mixed, technical, twisty) that says how many bends it needs; candidates are
 * drawn until one passes validation. A seed that cannot produce its character gives an easier one,
 * and in the end the hand-made circuit, so a race can always start.
 */
export function generateCircuitLayout(seed: string): CircuitLayout {
  const name = `Circuito ${seed}`;
  for (let character: CircuitCharacter | null = pickCharacter(seed); character; character = EASIER[character]) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_CHARACTER; attempt++) {
      const layout = buildCandidate(name, character, createSeededRandom(`${seed}#${character}#${attempt}`));
      // The shape is judged at its original size and then enlarged.
      if (findLayoutIssue(layout, LIMITS, CHARACTERS[character].targets) === null) return addCircuitFeatures(scaleLayout(layout), seed);
    }
  }
  return addCircuitFeatures(scaleLayout({ ...WEB_GP_CIRCUIT, name }), seed);
}
