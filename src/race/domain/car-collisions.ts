import { CAR_SPECS } from "@/race-car/domain/car-specs";
import type { RaceCar } from "@/race-car/domain/race-car";

// Each car is approximated by three circles along its length.
const CIRCLE_OFFSETS = [-1.8, 0, 1.8];
const RESTITUTION = 0.3;

export function resolveCarCollisions(cars: readonly RaceCar[]): void {
  const r2 = CAR_SPECS.collisionRadius * 2;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
      const sa = Math.sin(a.heading), ca = Math.cos(a.heading);
      const sb = Math.sin(b.heading), cb = Math.cos(b.heading);
      for (const oa of CIRCLE_OFFSETS) {
        for (const ob of CIRCLE_OFFSETS) {
          const dx = b.x + sb * ob - (a.x + sa * oa);
          const dz = b.z + cb * ob - (a.z + ca * oa);
          const d2 = dx * dx + dz * dz;
          if (d2 >= r2 * r2 || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = (r2 - d) / 2;
          a.x -= nx * pen;
          a.z -= nz * pen;
          b.x += nx * pen;
          b.z += nz * pen;
          const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (vrel < 0) {
            const impulse = (-(1 + RESTITUTION) * vrel) / 2;
            a.vx -= nx * impulse;
            a.vz -= nz * impulse;
            b.vx += nx * impulse;
            b.vz += nz * impulse;
            a.impact = Math.max(a.impact, -vrel);
            b.impact = Math.max(b.impact, -vrel);
          }
        }
      }
    }
  }
}
