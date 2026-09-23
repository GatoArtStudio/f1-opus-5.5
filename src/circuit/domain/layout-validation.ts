import { angleDiff } from "@/shared/domain/math";
import type { CircuitLayout } from "./circuit-layout";
import { sampleClosedSpline } from "./closed-spline";

export interface LayoutLimits {
  minLength: number;
  maxLength: number;
  /** Tightest allowed bend radius of the centreline. */
  minRadius: number;
  /** Minimum centreline distance between sections that are not neighbours. */
  minClearance: number;
}

export type LayoutIssue = "length" | "tight-corner" | "sections-too-close" | "left-side-blocked";

// Coarse sampling is plenty to judge the shape and keeps generation cheap.
const CHECK_SPACING = 6;
const CURVATURE_HALF_WINDOW = 2;
/** Sections closer than this along the lap count as neighbours. */
const NEIGHBOUR_DISTANCE = 150;
/** The main straight runs along +x through the start line; stands sit on its left (-z). */
const STANDS_ZONE = { minX: -420, maxX: 220, minZ: -8 };

/** Returns the first problem that would make the circuit unplayable, or null. */
export function findLayoutIssue(layout: CircuitLayout, limits: LayoutLimits): LayoutIssue | null {
  const loop = sampleClosedSpline(layout.controlPoints, CHECK_SPACING);
  const n = loop.xs.length, ds = loop.length / n;
  if (loop.length < limits.minLength || loop.length > limits.maxLength) return "length";

  const heading = (i: number) => Math.atan2(loop.xs[(i + 1) % n] - loop.xs[(i - 1 + n) % n], loop.zs[(i + 1) % n] - loop.zs[(i - 1 + n) % n]);
  const maxCurvature = 1 / limits.minRadius;
  const K = CURVATURE_HALF_WINDOW;
  for (let i = 0; i < n; i++) {
    const curvature = Math.abs(angleDiff(heading((i + K) % n), heading((i - K + n) % n))) / (2 * K * ds);
    if (curvature > maxCurvature) return "tight-corner";
  }

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
  return null;
}
