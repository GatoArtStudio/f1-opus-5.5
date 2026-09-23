import type { Circuit } from "@/circuit/domain/circuit";

export interface SpeedLimits {
  grip: number;
  brake: number;
  topSpeed: number;
  accel: number;
}

/**
 * Maximum speed at every sample of the racing line for a car with the given
 * limits: corner speed from grip, then backward (braking) and forward
 * (acceleration) passes around the loop.
 */
export function computeSpeedProfile(circuit: Circuit, { grip, brake, topSpeed, accel }: SpeedLimits): Float32Array {
  const N = circuit.n, ds = circuit.ds;
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = circuit.lineCurv[i];
    v[i] = Math.min(topSpeed, k > 1e-5 ? Math.sqrt(grip / k) : topSpeed);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) {
      const next = v[circuit.wrap(i + 1)];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * brake * ds));
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const j = circuit.wrap(i + 1);
      const a = accel * Math.max(0.05, 1 - (v[i] / topSpeed) ** 2);
      v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * a * ds));
    }
  }
  return v;
}
