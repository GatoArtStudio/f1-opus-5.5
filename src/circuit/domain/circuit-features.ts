import { randomBetween, shuffle, type RandomSource } from "@/shared/domain/math";
import { createSeededRandom } from "@/shared/domain/seeded-random";
import { TRACK_SCALE, type CircuitLayout } from "./circuit-layout";
import { THEME_IDS, THEME_PROFILES, type ThemeProfile } from "./circuit-theme";
import { sampleClosedSpline, type SampledLoop } from "./closed-spline";
import { elevationAt, isInStartZone, type ElevationSpec } from "./elevation-profile";
import { loopCurvature } from "./loop-curvature";
import type { TunnelSpan } from "./tunnel";

const SPACING = 6;
/** Steepest gradient a generated circuit may have (9 %). */
const MAX_GRADE = 0.09;
/** A stretch counts as straight enough for a tunnel below this curvature (radius 350 m). */
const TUNNEL_MAX_CURVATURE = 1 / 350;
const TUNNEL_LENGTH: readonly [number, number] = [150 * TRACK_SCALE, 380 * TRACK_SCALE];
const TUNNEL_MIN_RUN = 260 * TRACK_SCALE;
/** Keep tunnels clear of corners and of the start zone. */
const TUNNEL_EDGE_MARGIN = 45;
const START_ZONE_MARGIN = 80;

function buildElevation(profile: ThemeProfile, length: number, random: RandomSource): ElevationSpec {
  // Hills grow with the circuit so the gradients (and how dramatic they look) stay the same.
  const peak = randomBetween(profile.elevation, random) * TRACK_SCALE;
  const cycles = shuffle([1, 2, 3, 4, 5], random).slice(0, 3);
  const harmonics = cycles.map((c) => ({
    cycles: c,
    amplitude: (peak * randomBetween([0.45, 1], random)) / (1 + 0.5 * c),
    phase: randomBetween([0, Math.PI * 2], random),
  }));
  const spec: ElevationSpec = { harmonics, bias: peak * 0.2, scale: 1 };

  let steepest = 0, previous = elevationAt(spec, 0, length);
  for (let d = SPACING; d <= length; d += SPACING) {
    const y = elevationAt(spec, d, length);
    steepest = Math.max(steepest, Math.abs(y - previous) / SPACING);
    previous = y;
  }
  return steepest > MAX_GRADE ? { ...spec, scale: MAX_GRADE / steepest } : spec;
}

/** Tunnels fit only on long, gentle stretches away from the start straight. */
function pickTunnels(loop: SampledLoop, wanted: number, random: RandomSource): TunnelSpan[] {
  const n = loop.xs.length, ds = loop.length / n;
  const curvature = loopCurvature(loop, 3);
  const usable = Array.from({ length: n }, (_, i) =>
    curvature[i] < TUNNEL_MAX_CURVATURE && !isInStartZone(i * ds, loop.length, START_ZONE_MARGIN));

  // Runs of usable samples, trimmed at both ends; they never wrap past the start zone.
  const runs: TunnelSpan[] = [];
  let begin = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && usable[i]) {
      if (begin < 0) begin = i;
    } else if (begin >= 0) {
      const from = begin * ds + TUNNEL_EDGE_MARGIN, to = (i - 1) * ds - TUNNEL_EDGE_MARGIN;
      if (to - from >= TUNNEL_MIN_RUN) runs.push({ from, to });
      begin = -1;
    }
  }

  const tunnels: TunnelSpan[] = [];
  const order = shuffle(runs, random).slice(0, wanted);
  for (const run of order) {
    const length = Math.min(randomBetween(TUNNEL_LENGTH, random), run.to - run.from);
    const from = run.from + random() * (run.to - run.from - length);
    tunnels.push({ from, to: from + length });
  }
  return tunnels.sort((a, b) => a.from - b.from);
}

/**
 * Adds the seed-driven extras to a circuit shape: theme, hills and tunnels.
 * Drawn from its own random stream, so the shape of a seed never depends on it.
 */
export function addCircuitFeatures(layout: CircuitLayout, seed: string): CircuitLayout {
  const random = createSeededRandom(`${seed}#features`);
  const theme = THEME_IDS[Math.floor(random() * THEME_IDS.length)];
  const profile = THEME_PROFILES[theme];
  const loop = sampleClosedSpline(layout.controlPoints, SPACING);
  const wanted = Math.round(randomBetween(profile.tunnels, random));
  return {
    ...layout,
    theme,
    seed,
    elevation: buildElevation(profile, loop.length, random),
    tunnels: pickTunnels(loop, wanted, random),
  };
}
