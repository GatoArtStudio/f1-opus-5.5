import type { Circuit, Surface, TrackPosition } from "@/circuit/domain/circuit";
import { clamp } from "@/shared/domain/math";
import type { CarControls } from "./car-controls";
import { CAR_SPECS, GEAR_TOP_SPEEDS, type Gear } from "./car-specs";

const GRAVITY = 9.81;

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
    this.surface = this.circuit.surfaceAt(this.lateral);
    const grip =
      this.surface === "track" ? CAR_SPECS.grip : this.surface === "kerb" ? CAR_SPECS.kerbGrip : CAR_SPECS.grassGrip;

    let sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    let vf = this.vx * sh + this.vz * ch;
    let vl = this.vx * -ch + this.vz * sh;

    // Longitudinal forces.
    let a = 0;
    if (throttle > 0) {
      if (vf > -0.5) a += throttle * CAR_SPECS.engineAccel * Math.max(0, 1 - (vf / this.topSpeed) ** 2);
      else a += throttle * CAR_SPECS.brakeDecel;
    }
    if (brake > 0) {
      if (vf > 0.5) a -= brake * CAR_SPECS.brakeDecel;
      else if (vf > -CAR_SPECS.reverseSpeed) a -= brake * 7;
    }
    a -= Math.sign(vf) * (0.4 + 0.0009 * vf * vf);
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
