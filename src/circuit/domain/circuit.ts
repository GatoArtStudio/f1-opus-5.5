import { angleDiff, clamp, wrapIndex } from "@/shared/domain/math";
import type { CircuitLayout } from "./circuit-layout";
import type { CircuitThemeId } from "./circuit-theme";
import { sampleClosedSpline } from "./closed-spline";
import { elevationAt } from "./elevation-profile";
import { minFilterLoop, smoothLoop } from "./signal-filters";
import { distanceToTunnel, TUNNEL, type TunnelSpan } from "./tunnel";

export type Surface = "track" | "kerb" | "grass";

export interface TrackPosition {
  /** Nearest centreline sample. */
  index: number;
  /** Signed distance from the centreline, positive to the right. */
  lateral: number;
  /** Distance along the lap from the start/finish line. */
  dist: number;
}

export interface Point2 {
  x: number;
  z: number;
}

/** Margin the racing line keeps from the track edge (half a car + safety). */
const RACING_LINE_EDGE_MARGIN = 1.6;

/**
 * Sampled representation of a circuit: centreline, direction, curvature,
 * barrier distances and the racing line. Pure data + geometry queries.
 */
export class Circuit {
  readonly name: string;
  readonly theme: CircuitThemeId;
  /** Seeds everything random about the surroundings. */
  readonly seed: string;
  readonly tunnels: readonly TunnelSpan[];
  readonly halfWidth: number;
  readonly kerbWidth: number;
  readonly length: number;
  /** Number of centreline samples. */
  readonly n: number;
  /** Distance between samples. */
  readonly ds: number;

  readonly px: Float32Array;
  readonly pz: Float32Array;
  /** Unit tangent (direction of travel). */
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** Unit right-hand vector. */
  readonly rx: Float32Array;
  readonly rz: Float32Array;
  /** Signed curvature, > 0 means a right-hand bend. */
  readonly curv: Float32Array;
  /** Distance from the centreline to the barrier on each side. */
  readonly wallL: Float32Array;
  readonly wallR: Float32Array;
  /** Lateral offset of the racing line and its curvature. */
  readonly lineOffset: Float32Array;
  readonly lineCurv: Float32Array;
  /** Height of the road surface at each sample, in metres. */
  readonly elevation: Float32Array;
  /** Gradient along the direction of travel (rise over run); > 0 is uphill. */
  readonly grade: Float32Array;

  constructor(layout: CircuitLayout) {
    this.name = layout.name;
    this.theme = layout.theme ?? "forest";
    this.seed = layout.seed ?? layout.name;
    this.tunnels = layout.tunnels ?? [];
    this.halfWidth = layout.width / 2;
    this.kerbWidth = layout.kerbWidth;

    const loop = sampleClosedSpline(layout.controlPoints, layout.sampleSpacing);
    const N = (this.n = loop.xs.length);
    this.length = loop.length;
    this.ds = this.length / N;
    this.px = loop.xs;
    this.pz = loop.zs;

    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.rx = new Float32Array(N);
    this.rz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - 1), b = this.wrap(i + 1);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
      this.tx[i] = dx;
      this.tz[i] = dz;
      this.rx[i] = -dz;
      this.rz[i] = dx;
    }

    const raw = new Float32Array(N);
    const K = 4;
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - K), b = this.wrap(i + K);
      raw[i] = -angleDiff(this.headingAt(b), this.headingAt(a)) / (2 * K * this.ds);
    }
    this.curv = smoothLoop(raw, 6);

    // On the inside of tight bends the barrier is pulled in so the offset
    // curve never folds over itself.
    const base = this.halfWidth + this.kerbWidth + layout.runoff;
    const wl = new Float32Array(N), wr = new Float32Array(N);
    const absK = smoothLoop(this.curv.map(Math.abs), 12);
    for (let i = 0; i < N; i++) {
      const limit = absK[i] > 1e-4 ? 0.8 / absK[i] : Infinity;
      const inner = Math.max(this.halfWidth + this.kerbWidth + 3, Math.min(base, limit));
      if (this.curv[i] > 0) {
        wr[i] = inner;
        wl[i] = base;
      } else {
        wl[i] = inner;
        wr[i] = base;
      }
    }
    // Inside a tunnel the barriers hug the walls, funnelling in ahead of each portal.
    for (let i = 0; i < N && this.tunnels.length; i++) {
      const t = Math.min(1, distanceToTunnel(this.tunnels, i * this.ds) / TUNNEL.funnel);
      const limit = TUNNEL.wallOffset + t * (base - TUNNEL.wallOffset);
      wl[i] = Math.min(wl[i], limit);
      wr[i] = Math.min(wr[i], limit);
    }
    this.wallL = smoothLoop(minFilterLoop(wl, 15), 10);
    this.wallR = smoothLoop(minFilterLoop(wr, 15), 10);

    this.elevation = new Float32Array(N);
    if (layout.elevation) {
      for (let i = 0; i < N; i++) this.elevation[i] = elevationAt(layout.elevation, i * this.ds, this.length);
    }
    const rise = new Float32Array(N);
    for (let i = 0; i < N; i++) rise[i] = (this.elevation[this.wrap(i + 1)] - this.elevation[this.wrap(i - 1)]) / (2 * this.ds);
    this.grade = smoothLoop(rise, 3);

    const line = this.computeRacingLine(this.halfWidth - RACING_LINE_EDGE_MARGIN);
    this.lineOffset = line.offset;
    this.lineCurv = line.curvature;
  }

  wrap(i: number): number {
    return wrapIndex(i, this.n);
  }

  headingAt(index: number): number {
    return Math.atan2(this.tx[index], this.tz[index]);
  }

  surfaceAt(lateral: number): Surface {
    const a = Math.abs(lateral);
    return a < this.halfWidth ? "track" : a < this.halfWidth + this.kerbWidth ? "kerb" : "grass";
  }

  /**
   * Nearest point on the centreline. `hint` (the previous index) limits the
   * search to a window around it.
   */
  project(x: number, z: number, hint = -1, out: TrackPosition = { index: 0, lateral: 0, dist: 0 }): TrackPosition {
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = this.wrap(hint + k);
        const d = (x - this.px[i]) ** 2 + (z - this.pz[i]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best < 0 || bestD > 60 * 60) {
      for (let i = 0; i < this.n; i++) {
        const d = (x - this.px[i]) ** 2 + (z - this.pz[i]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    const dx = x - this.px[best], dz = z - this.pz[best];
    const along = dx * this.tx[best] + dz * this.tz[best];
    out.index = best;
    out.lateral = dx * this.rx[best] + dz * this.rz[best];
    out.dist = (best * this.ds + along + this.length) % this.length;
    return out;
  }

  /** World position for a distance along the lap and a lateral offset. */
  pointAt(dist: number, lateral = 0): Point2 {
    const f = (((dist % this.length) + this.length) % this.length) / this.ds;
    const i = Math.floor(f), j = this.wrap(i + 1), t = f - i;
    const cx = this.px[i] + (this.px[j] - this.px[i]) * t;
    const cz = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    const rx = this.rx[i] + (this.rx[j] - this.rx[i]) * t;
    const rz = this.rz[i] + (this.rz[j] - this.rz[i]) * t;
    return { x: cx + rx * lateral, z: cz + rz * lateral };
  }

  /** Road surface height at a distance along the lap. */
  elevationAt(dist: number): number {
    const f = (((dist % this.length) + this.length) % this.length) / this.ds;
    const i = Math.floor(f), j = this.wrap(i + 1);
    return this.elevation[i] + (this.elevation[j] - this.elevation[i]) * (f - i);
  }

  indexAt(dist: number): number {
    return this.wrap(Math.round(dist / this.ds));
  }

  /**
   * Iterative relaxation: each point moves toward the midpoint of its
   * neighbours while staying inside the track. Converges to a smooth, short
   * line that clips apexes.
   */
  private computeRacingLine(limit: number) {
    const N = this.n;
    const o = new Float32Array(N);
    const lx = new Float32Array(N), lz = new Float32Array(N);
    const place = (offsets: Float32Array) => {
      for (let i = 0; i < N; i++) {
        lx[i] = this.px[i] + this.rx[i] * offsets[i];
        lz[i] = this.pz[i] + this.rz[i] * offsets[i];
      }
    };
    for (let it = 0; it < 600; it++) {
      place(o);
      for (let i = 0; i < N; i++) {
        const a = this.wrap(i - 3), b = this.wrap(i + 3);
        const mx = (lx[a] + lx[b]) / 2 - this.px[i];
        const mz = (lz[a] + lz[b]) / 2 - this.pz[i];
        const target = mx * this.rx[i] + mz * this.rz[i];
        o[i] = clamp(o[i] + (target - o[i]) * 0.5, -limit, limit);
      }
    }
    const offset = smoothLoop(o, 3);
    place(offset);

    // Curvature from the circumcircle through i-5, i, i+5.
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - 5), b = this.wrap(i + 5);
      const ax = lx[a], az = lz[a], bx = lx[i], bz = lz[i], cx = lx[b], cz = lz[b];
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const d1 = Math.hypot(bx - ax, bz - az), d2 = Math.hypot(cx - bx, cz - bz), d3 = Math.hypot(cx - ax, cz - az);
      k[i] = Math.abs((2 * cross) / (d1 * d2 * d3 + 1e-6));
    }
    return { offset, curvature: smoothLoop(k, 3) };
  }
}
