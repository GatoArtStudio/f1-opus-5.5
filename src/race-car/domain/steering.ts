import { clamp } from "@/shared/domain/math";
import { CAR_SPECS } from "./car-specs";
import type { RaceCar } from "./race-car";

/** Steering command (-1 to 1) that pure-pursuit aims the car at a point on the ground. */
export function steerToward(car: RaceCar, targetX: number, targetZ: number, speed: number): number {
  const dx = targetX - car.x, dz = targetZ - car.z;
  const sh = Math.sin(car.heading), ch = Math.cos(car.heading);
  const alpha = Math.atan2(dx * -ch + dz * sh, dx * sh + dz * ch);
  const wheel = Math.atan((2 * CAR_SPECS.wheelBase * Math.sin(alpha)) / Math.max(Math.hypot(dx, dz), 0.1));
  return clamp(wheel / (CAR_SPECS.maxSteer / (1 + speed / 20)), -1, 1);
}
