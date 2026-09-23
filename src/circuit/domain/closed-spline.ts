// Closed centripetal Catmull-Rom spline, resampled at equal arc-length steps.

type Point = readonly [number, number];

interface Segment {
  x: [number, number, number, number]; // cubic coefficients c0..c3
  z: [number, number, number, number];
}

function cubic(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number) {
  const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1;
  const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1;
  return [x1, t1, -3 * x1 + 3 * x2 - 2 * t1 - t2, 2 * x1 - 2 * x2 + t1 + t2] as [number, number, number, number];
}

function buildSegments(points: readonly Point[]): Segment[] {
  const n = points.length;
  const segments: Segment[] = [];
  const knot = (a: Point, b: Point) => Math.pow((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2, 0.25);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    let dt1 = knot(p1, p2);
    if (dt1 < 1e-4) dt1 = 1;
    let dt0 = knot(p0, p1);
    if (dt0 < 1e-4) dt0 = dt1;
    let dt2 = knot(p2, p3);
    if (dt2 < 1e-4) dt2 = dt1;
    segments.push({
      x: cubic(p0[0], p1[0], p2[0], p3[0], dt0, dt1, dt2),
      z: cubic(p0[1], p1[1], p2[1], p3[1], dt0, dt1, dt2),
    });
  }
  return segments;
}

const evalCubic = (c: readonly number[], t: number) => c[0] + t * (c[1] + t * (c[2] + t * c[3]));

export interface SampledLoop {
  xs: Float32Array;
  zs: Float32Array;
  length: number;
}

/** Samples the loop into points spaced (approximately) `spacing` metres apart. */
export function sampleClosedSpline(points: readonly Point[], spacing: number): SampledLoop {
  const segments = buildSegments(points);
  const perSegment = 64;
  const total = segments.length * perSegment;

  // Dense polyline + cumulative arc length.
  const dx = new Float64Array(total + 1), dz = new Float64Array(total + 1), cum = new Float64Array(total + 1);
  for (let k = 0; k <= total; k++) {
    const s = Math.min(Math.floor(k / perSegment), segments.length - 1);
    const t = k / perSegment - s;
    dx[k] = evalCubic(segments[s].x, t);
    dz[k] = evalCubic(segments[s].z, t);
    if (k > 0) cum[k] = cum[k - 1] + Math.hypot(dx[k] - dx[k - 1], dz[k] - dz[k - 1]);
  }
  const length = cum[total];
  const n = Math.round(length / spacing);
  const xs = new Float32Array(n), zs = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * length;
    while (j < total - 1 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    xs[i] = dx[j] + (dx[j + 1] - dx[j]) * f;
    zs[i] = dz[j] + (dz[j + 1] - dz[j]) * f;
  }
  return { xs, zs, length };
}
