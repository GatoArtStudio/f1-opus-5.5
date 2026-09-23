/** Performance envelope shared by every car. Units: metres, seconds, m/s. */
export const CAR_SPECS = {
  length: 5.4,
  width: 2.0,
  wheelBase: 3.6,
  maxSpeed: 92, // ~331 km/h
  engineAccel: 15, // m/s² at zero speed
  brakeDecel: 40,
  reverseSpeed: 12,
  grip: 36, // max lateral acceleration on asphalt
  kerbGrip: 30,
  grassGrip: 11,
  grassDrag: 9,
  grassMaxSpeed: 42,
  maxSteer: 0.42, // wheel angle (rad) at standstill
  collisionRadius: 1.05,
  wheelRadius: 0.36,
} as const;

/** Upper speed (m/s) of each gear; index = gear number. */
export const GEAR_TOP_SPEEDS = [0, 22, 36, 48, 59, 69, 78, 86, 999] as const;

export type Gear = number | "N" | "R";
