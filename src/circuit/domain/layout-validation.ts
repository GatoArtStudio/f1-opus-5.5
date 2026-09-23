import type { CharacterTargets } from "./circuit-character";
import type { CircuitLayout } from "./circuit-layout";
import { sampleClosedSpline } from "./closed-spline";
import { isInStartZone } from "./elevation-profile";
import { loopCurvature } from "./loop-curvature";

export interface LayoutLimits {
  minLength: number;
  maxLength: number;
  /** Tightest allowed bend radius of the centreline. */
  minRadius: number;
  /** Minimum centreline distance between sections that are not neighbours. */
  minClearance: number;
}

export type LayoutIssue =
  | "length"
  | "tight-corner"
  | "sections-too-close"
  | "left-side-blocked"
  | "too-few-corners"
  | "too-few-tight-corners"
  | "long-straight";

// Coarse sampling is plenty to judge the shape and keeps generation cheap.
const CHECK_SPACING = 6;
const CURVATURE_HALF_WINDOW = 2;
/** Sections closer than this along the lap count as neighbours. */
const NEIGHBOUR_DISTANCE = 150;
/** The main straight runs along +x through the start line; stands sit on its left (-z). */
const STANDS_ZONE = { minX: -450, maxX: 350, minZ: -8 };
/** A bend is a stretch tighter than this radius, and a tight one is tighter than the second (m). */
const CORNER_RADIUS = 110;
const TIGHT_RADIUS = 55;

export interface CornerCount {
  corners: number;
  tightCorners: number;
  /** Longest run between bends that does not touch the start straight (m). */
  longestStraight: number;
}

/** Counts the bends of a loop and finds its longest straight, away from the start line. */
export function measureCorners(loop: ReturnType<typeof sampleClosedSpline>): CornerCount {
  const n = loop.xs.length, ds = loop.length / n;
  const curvature = loopCurvature(loop, CURVATURE_HALF_WINDOW);
  const radius = (i: number) => (curvature[i] > 1e-6 ? 1 / curvature[i] : Infinity);
  const bend = (i: number) => radius(i) < CORNER_RADIUS;
  // Start at a sample outside any bend so no bend is split by the start of the array.
  let first = 0;
  while (first < n && bend(first)) first++;
  let corners = 0, tightCorners = 0, longestStraight = 0;
  if (first === n) return { corners: 1, tightCorners: 0, longestStraight: 0 };

  let inCorner = false, tightest = Infinity, run = 0, runTouchesStart = false;
  for (let k = 1; k <= n; k++) {
    const i = (first + k) % n;
    if (bend(i)) {
      if (!inCorner) {
        inCorner = true;
        corners++;
        tightest = Infinity;
        if (!runTouchesStart) longestStraight = Math.max(longestStraight, run);
        run = 0;
        runTouchesStart = false;
      }
      tightest = Math.min(tightest, radius(i));
    } else {
      if (inCorner) {
        inCorner = false;
        if (tightest < TIGHT_RADIUS) tightCorners++;
      }
      run += ds;
      if (isInStartZone(i * ds, loop.length, 50)) runTouchesStart = true;
    }
  }
  if (inCorner && tightest < TIGHT_RADIUS) tightCorners++;
  if (!runTouchesStart) longestStraight = Math.max(longestStraight, run);
  return { corners, tightCorners, longestStraight };
}

/** Returns the first problem that would make the circuit unplayable, or null. */
export function findLayoutIssue(layout: CircuitLayout, limits: LayoutLimits, targets?: CharacterTargets): LayoutIssue | null {
  const loop = sampleClosedSpline(layout.controlPoints, CHECK_SPACING);
  const n = loop.xs.length, ds = loop.length / n;
  if (loop.length < limits.minLength || loop.length > limits.maxLength) return "length";

  const maxCurvature = 1 / limits.minRadius;
  const curvature = loopCurvature(loop, CURVATURE_HALF_WINDOW);
  for (let i = 0; i < n; i++) if (curvature[i] > maxCurvature) return "tight-corner";

  const neighbours = Math.ceil(NEIGHBOUR_DISTANCE / ds);
  const clearance2 = limits.minClearance ** 2;
  for (let i = 0; i < n; i++) {
    for (let j = i + neighbours; j < n; j++) {
      if (n - (j - i) < neighbours) break; // wraps around into a neighbour of i
      if ((loop.xs[i] - loop.xs[j]) ** 2 + (loop.zs[i] - loop.zs[j]) ** 2 < clearance2) return "sections-too-close";
    }
  }

  for (let i = 0; i < n; i++) {
    const x = loop.xs[i];
    if (x > STANDS_ZONE.minX && x < STANDS_ZONE.maxX && loop.zs[i] < STANDS_ZONE.minZ) return "left-side-blocked";
  }

  if (targets) {
    const { corners, tightCorners, longestStraight } = measureCorners(loop);
    if (corners < targets.corners) return "too-few-corners";
    if (tightCorners < targets.tightCorners) return "too-few-tight-corners";
    if (longestStraight > targets.longestStraight) return "long-straight";
  }
  return null;
}
