import { angleDiff } from "@/shared/domain/math";
import type { SampledLoop } from "./closed-spline";

/** Absolute curvature (1/m) at every sample of a closed loop, from heading changes `halfWindow` samples apart. */
export function loopCurvature(loop: SampledLoop, halfWindow: number): Float32Array {
  const n = loop.xs.length, ds = loop.length / n;
  const heading = (i: number) => {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    return Math.atan2(loop.xs[b] - loop.xs[a], loop.zs[b] - loop.zs[a]);
  };
  const curvature = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ahead = heading((i + halfWindow) % n), behind = heading((i - halfWindow + n) % n);
    curvature[i] = Math.abs(angleDiff(ahead, behind)) / (2 * halfWindow * ds);
  }
  return curvature;
}
