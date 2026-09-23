import * as THREE from 'three';
import { TRACK, CAR } from './config.js';

// Sampled representation of the circuit: centreline, direction, curvature,
// barrier distances and a pre-computed racing line used by the bots.
export class Track {
  constructor(def = TRACK) {
    this.halfWidth = def.width / 2;
    this.kerbWidth = def.kerbWidth;

    const curve = new THREE.CatmullRomCurve3(
      def.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.length = curve.getLength();
    const N = (this.n = Math.round(this.length / def.sampleSpacing));
    this.ds = this.length / N;

    const pts = curve.getSpacedPoints(N);
    this.px = new Float32Array(N);
    this.pz = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.rx = new Float32Array(N); // right-hand vector
    this.rz = new Float32Array(N);
    this.curv = new Float32Array(N); // signed curvature, > 0 = right-hand bend

    for (let i = 0; i < N; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
    }
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - 1), b = this.wrap(i + 1);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
      this.rx[i] = -dz; this.rz[i] = dx;
    }
    const raw = new Float32Array(N);
    const K = 4;
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - K), b = this.wrap(i + K);
      const h1 = Math.atan2(this.tx[a], this.tz[a]);
      const h2 = Math.atan2(this.tx[b], this.tz[b]);
      raw[i] = -angleDiff(h2, h1) / (2 * K * this.ds);
    }
    this.curv = smooth(raw, 6);

    // Barrier distance on each side. On the inside of tight bends the barrier
    // is pulled in so the offset curve never folds over itself.
    const base = this.halfWidth + this.kerbWidth + def.runoff;
    this.wallBase = base;
    const wl = new Float32Array(N), wr = new Float32Array(N);
    const absK = smooth(this.curv.map(Math.abs), 12);
    for (let i = 0; i < N; i++) {
      const lim = absK[i] > 1e-4 ? 0.8 / absK[i] : 1e9;
      const inner = Math.max(this.halfWidth + this.kerbWidth + 3, Math.min(base, lim));
      if (this.curv[i] > 0) { wr[i] = inner; wl[i] = base; } else { wl[i] = inner; wr[i] = base; }
    }
    this.wallL = smooth(minFilter(wl, 15), 10);
    this.wallR = smooth(minFilter(wr, 15), 10);

    this.buildRacingLine();
  }

  wrap(i) {
    const n = this.n;
    return ((i % n) + n) % n;
  }

  // Nearest point on the centreline. `hint` speeds up the search by only
  // scanning a window around the previous index.
  project(x, z, hint = -1, out = {}) {
    const N = this.n;
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = this.wrap(hint + k);
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    if (best < 0 || bestD > 60 * 60) {
      for (let i = 0; i < N; i++) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const i = best;
    const dx = x - this.px[i], dz = z - this.pz[i];
    const along = dx * this.tx[i] + dz * this.tz[i];
    out.index = i;
    out.lateral = dx * this.rx[i] + dz * this.rz[i];
    out.dist = (i * this.ds + along + this.length) % this.length;
    return out;
  }

  // World position for a distance along the track and a lateral offset.
  pointAt(dist, lateral = 0, out = new THREE.Vector3()) {
    const f = (((dist % this.length) + this.length) % this.length) / this.ds;
    const i = Math.floor(f), j = this.wrap(i + 1), t = f - i;
    const cx = this.px[i] + (this.px[j] - this.px[i]) * t;
    const cz = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    const rx = this.rx[i] + (this.rx[j] - this.rx[i]) * t;
    const rz = this.rz[i] + (this.rz[j] - this.rz[i]) * t;
    return out.set(cx + rx * lateral, 0, cz + rz * lateral);
  }

  headingAt(index) {
    return Math.atan2(this.tx[index], this.tz[index]);
  }

  // Iterative relaxation: each point moves toward the midpoint of its
  // neighbours while staying inside the track. Converges to a smooth,
  // short line that clips apexes — good enough for AI.
  buildRacingLine() {
    const N = this.n;
    const lim = this.halfWidth - CAR.width / 2 - 0.6;
    const o = new Float32Array(N);
    const lx = new Float32Array(N), lz = new Float32Array(N);
    for (let it = 0; it < 600; it++) {
      for (let i = 0; i < N; i++) {
        lx[i] = this.px[i] + this.rx[i] * o[i];
        lz[i] = this.pz[i] + this.rz[i] * o[i];
      }
      for (let i = 0; i < N; i++) {
        const a = this.wrap(i - 3), b = this.wrap(i + 3);
        const mx = (lx[a] + lx[b]) / 2 - this.px[i];
        const mz = (lz[a] + lz[b]) / 2 - this.pz[i];
        const target = mx * this.rx[i] + mz * this.rz[i];
        o[i] = clamp(o[i] + (target - o[i]) * 0.5, -lim, lim);
      }
    }
    this.lineOffset = smooth(o, 3);
    for (let i = 0; i < N; i++) {
      lx[i] = this.px[i] + this.rx[i] * this.lineOffset[i];
      lz[i] = this.pz[i] + this.rz[i] * this.lineOffset[i];
    }
    // Curvature of the racing line (circumcircle through i-5, i, i+5).
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - 5), b = this.wrap(i + 5);
      const ax = lx[a], az = lz[a], bx = lx[i], bz = lz[i], cx = lx[b], cz = lz[b];
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const d1 = Math.hypot(bx - ax, bz - az), d2 = Math.hypot(cx - bx, cz - bz), d3 = Math.hypot(cx - ax, cz - az);
      k[i] = Math.abs((2 * cross) / (d1 * d2 * d3 + 1e-6));
    }
    this.lineCurv = smooth(k, 3);
  }

  // Maximum speed along the racing line for a car with the given limits.
  speedProfile(grip, brake, vmax, accel) {
    const N = this.n, ds = this.ds;
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = this.lineCurv[i];
      v[i] = Math.min(vmax, k > 1e-5 ? Math.sqrt(grip / k) : vmax);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = v[this.wrap(i + 1)];
        v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * brake * ds));
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const j = this.wrap(i + 1);
        const a = accel * Math.max(0.05, 1 - (v[i] / vmax) ** 2);
        v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * a * ds));
      }
    }
    return v;
  }
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function smooth(arr, radius) {
  const n = arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) s += arr[(i + k + n) % n];
    out[i] = s / (radius * 2 + 1);
  }
  return out;
}

function minFilter(arr, radius) {
  const n = arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let k = -radius; k <= radius; k++) m = Math.min(m, arr[(i + k + n) % n]);
    out[i] = m;
  }
  return out;
}
