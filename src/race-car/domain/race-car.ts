import type { Circuit, Surface, TrackPosition } from "@/circuit/domain/circuit";
import { clamp } from "@/shared/domain/math";
import type { CarControls } from "./car-controls";
import { CAR_SPECS, GEAR_TOP_SPEEDS, type Gear } from "./car-specs";
import { Tyre } from "@/tyres/domain/tyre";
import type { TrackConditions } from "@/weather/domain/weather";
import { SLIPSTREAM } from "./slipstream";

const GRAVITY = 9.81;
/** What a full catch-up push adds to grip, engine power and top speed. */
export const CATCH_UP_GRIP = 0.04;
export const CATCH_UP_ENGINE = 0.08;
const CATCH_UP_TOP = 0.03;

const scratch: TrackPosition = { index: 0, lateral: 0, dist: 0 };

/**
 * Arcade vehicle dynamics on a circuit: engine/brakes/drag, speed-sensitive
 * steering limited by tyre grip, lateral slip and barrier collisions.
 * Heading convention: forward = (sin h, cos h) on the XZ plane.
 */
export class RaceCar {
  readonly topSpeed: number;

  x = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  /** Signed forward speed. */
  speed = 0;
  steerAngle = 0;
  wheelSpin = 0;
  surface: Surface = "track";
  /** Strongest hit since last cleared (for audio / camera shake). */
  impact = 0;

  index = 0;
  lateral = 0;
  trackDist = 0;
  /** Road height under the car and the slope of the road along its heading (rad, > 0 nose up). */
  y = 0;
  pitch = 0;
  /** Slipstream this car is running in (0-1), the car providing it, and the turbulence costing grip (0-1). */
  tow = 0;
  towSource: RaceCar | null = null;
  dirtyAir = 0;
  /** Tyres on the car, the track they run on (shared by every car) and the grip they give right now. */
  tyre = new Tyre("medium");
  conditions: TrackConditions = { water: 0, loose: 0, temperature: 25 };
  gripFactor = 1;
  /** A better car than the standard one (1 = standard); the harder bots have it. */
  gripBoost = 1;
  engineBoost = 1;
  /** Extra push (0-1) for a bot that has fallen behind the player; see `Race`. */
  catchUp = 0;
  /** How fast this driver wears the tyres compared with the standard (1). */
  tyreWear = 1;
  /** Share of the available grip being used to corner, 0-1+; wears the tyres. */
  gLoad = 0;
  /** Driving down the pit lane, which is asphalt wherever it sits. */
  inPit = false;

  readonly controls: CarControls = { throttle: 0, brake: 0, steer: 0 };

  constructor(private readonly circuit: Circuit, topFactor = 1) {
    this.topSpeed = CAR_SPECS.maxSpeed * topFactor;
  }

  placeAt(dist: number, lateral: number): void {
    const p = this.circuit.pointAt(dist, lateral);
    this.x = p.x;
    this.z = p.z;
    const pr = this.circuit.project(this.x, this.z, -1, scratch);
    this.heading = this.circuit.headingAt(pr.index);
    this.vx = this.vz = this.speed = 0;
    this.steerAngle = 0;
    this.index = pr.index;
    this.lateral = pr.lateral;
    this.trackDist = pr.dist;
    this.updateRoadHeight();
  }

  /** Brings the car to a dead stop (parked in a pit box). */
  halt(): void {
    this.vx = this.vz = this.speed = 0;
    this.steerAngle = 0;
  }

  /** Puts the car back on the asphalt, facing the direction of travel. */
  respawn(): void {
    const c = this.circuit;
    this.placeAt(this.trackDist, clamp(this.lateral, -c.halfWidth + 2, c.halfWidth - 2));
  }

  get gear(): Gear {
    const v = Math.abs(this.speed);
    if (this.speed < -0.5) return "R";
    if (v < 0.5 && this.controls.throttle === 0) return "N";
    for (let g = 1; g < GEAR_TOP_SPEEDS.length; g++) if (v < GEAR_TOP_SPEEDS[g]) return g;
    return 8;
  }

  get rpm(): number {
    const v = Math.abs(this.speed);
    const gear = this.gear;
    const g = typeof gear === "number" ? gear : 1;
    const lo = GEAR_TOP_SPEEDS[g - 1] ?? 0;
    const hi = Math.min(GEAR_TOP_SPEEDS[g] ?? 95, 95);
    const t = clamp((v - lo * 0.75) / (hi - lo * 0.75), 0, 1);
    return 4000 + t * 8000 + this.controls.throttle * 600;
  }

  update(dt: number): void {
    const { throttle, brake, steer } = this.controls;
    this.surface = this.inPit ? "track" : this.circuit.surfaceAt(this.lateral);
    const surfaceGrip =
      this.surface === "track"
        ? CAR_SPECS.grip
        : this.surface === "kerb"
          ? CAR_SPECS.kerbGrip * (1 - 0.3 * this.conditions.water) // wet paint is slippery
          : CAR_SPECS.grassGrip;
    this.gripFactor = this.tyre.grip(this.conditions) * this.gripBoost * (1 + CATCH_UP_GRIP * this.catchUp);
    const grip = surfaceGrip * this.gripFactor * (1 - SLIPSTREAM.maxGripLoss * this.dirtyAir);

    let sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    let vf = this.vx * sh + this.vz * ch;
    let vl = this.vx * -ch + this.vz * sh;

    // Longitudinal forces; poor grip also costs traction and braking.
    const traction = (0.6 + 0.4 * Math.min(1, this.gripFactor)) * this.engineBoost * (1 + CATCH_UP_ENGINE * this.catchUp);
    const braking = 0.5 + 0.5 * Math.min(1.12, this.gripFactor);
    let a = 0;
    if (throttle > 0) {
      if (vf > -0.5) a += throttle * CAR_SPECS.engineAccel * traction * Math.max(0, 1 - (vf / (this.topSpeed * (1 + CATCH_UP_TOP * this.catchUp))) ** 2);
      else a += throttle * CAR_SPECS.brakeDecel;
    }
    if (brake > 0) {
      if (vf > 0.5) a -= brake * CAR_SPECS.brakeDecel * braking;
      else if (vf > -CAR_SPECS.reverseSpeed) a -= brake * 7;
    }
    a -= Math.sign(vf) * (0.4 + 0.0009 * vf * vf * (1 - SLIPSTREAM.maxDragReduction * this.tow));
    a -= GRAVITY * this.slopeAlongHeading(sh, ch);
    if (this.surface === "grass") {
      a -= Math.sign(vf) * CAR_SPECS.grassDrag * (Math.abs(vf) > CAR_SPECS.grassMaxSpeed ? 2.2 : 1);
    }
    const prev = vf;
    vf += a * dt;
    if (throttle === 0 && prev !== 0 && Math.sign(vf) !== Math.sign(prev)) vf = 0;

    // Steering: less lock at speed, yaw limited by available grip.
    const maxSteer = CAR_SPECS.maxSteer / (1 + Math.abs(vf) / 20);
    this.steerAngle += clamp(steer * maxSteer - this.steerAngle, -3 * dt, 3 * dt);
    const yawLimit = (grip * 1.08) / Math.max(Math.abs(vf), 4);
    const yaw = clamp((vf * Math.tan(this.steerAngle)) / CAR_SPECS.wheelBase, -yawLimit, yawLimit);

    // World velocity from the old frame, re-expressed in the rotated one;
    // tyres then cancel lateral slip up to their grip.
    const wx = sh * vf - ch * vl, wz = ch * vf + sh * vl;
    this.heading -= yaw * dt;
    sh = Math.sin(this.heading);
    ch = Math.cos(this.heading);
    vf = wx * sh + wz * ch;
    vl = wx * -ch + wz * sh;
    vl -= clamp(vl, -grip * dt, grip * dt);

    this.vx = sh * vf - ch * vl;
    this.vz = ch * vf + sh * vl;
    this.speed = vf;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.wheelSpin += (vf / CAR_SPECS.wheelRadius) * dt;
    this.gLoad = clamp(Math.abs(vf * yaw) / Math.max(grip, 1), 0, 1.5);
    this.tyre.advance(dt, vf, this.gLoad, this.conditions, this.tyreWear);

    this.updateTrackPosition();
    this.collideWalls();
  }

  updateTrackPosition(): void {
    const pr = this.circuit.project(this.x, this.z, this.index, scratch);
    this.index = pr.index;
    this.lateral = pr.lateral;
    this.trackDist = pr.dist;
    this.updateRoadHeight();
  }

  /** Gradient in the direction the car is pointing. */
  private slopeAlongHeading(sh: number, ch: number): number {
    const c = this.circuit, i = this.index;
    return c.grade[i] * (sh * c.tx[i] + ch * c.tz[i]);
  }

  private updateRoadHeight(): void {
    this.y = this.circuit.elevationAt(this.trackDist);
    this.pitch = Math.atan(this.slopeAlongHeading(Math.sin(this.heading), Math.cos(this.heading)));
  }

  collideWalls(): void {
    const c = this.circuit, i = this.index;
    const half = CAR_SPECS.width / 2 + 0.2;
    const right = c.wallR[i] - half, left = -(c.wallL[i] - half);
    let side = 0, over = 0;
    if (this.lateral > right) {
      side = 1;
      over = this.lateral - right;
    } else if (this.lateral < left) {
      side = -1;
      over = left - this.lateral;
    }
    if (!side) return;

    const nx = c.rx[i] * side, nz = c.rz[i] * side; // points into the wall
    this.x -= nx * over;
    this.z -= nz * over;
    const vn = this.vx * nx + this.vz * nz;
    if (vn > 0) {
      this.vx -= nx * vn * 1.35;
      this.vz -= nz * vn * 1.35;
      const scrub = clamp(1 - vn * 0.02, 0.6, 0.98);
      this.vx *= scrub;
      this.vz *= scrub;
      this.impact = Math.max(this.impact, vn);
    }
    this.lateral -= side * over;
  }
}
