import type { Circuit } from "@/circuit/domain/circuit";
import { CAR_SPECS } from "@/race-car/domain/car-specs";
import type { RaceCar } from "@/race-car/domain/race-car";
import { clamp, type RandomSource } from "@/shared/domain/math";
import { computeSpeedProfile } from "./speed-profile";

/**
 * Drives a RaceCar along the racing line: pure-pursuit steering, a
 * pre-computed speed profile for throttle/brake, simple overtaking and
 * recovery when stuck or facing the wrong way.
 */
export class BotDriver {
  private readonly profile: Float32Array;
  private avoid = 0; // extra lateral offset used to pass other cars
  private readonly wobblePhase: number;
  private stuckTime = 0;
  private reverseTime = 0;
  private lostTime = 0;

  constructor(
    private readonly car: RaceCar,
    private readonly circuit: Circuit,
    skill: number,
    random: RandomSource = Math.random,
  ) {
    this.profile = computeSpeedProfile(circuit, {
      grip: CAR_SPECS.grip * skill,
      brake: CAR_SPECS.brakeDecel * 0.8 * skill,
      topSpeed: car.topSpeed,
      accel: CAR_SPECS.engineAccel,
    });
    this.wobblePhase = random() * 100;
  }

  update(dt: number, cars: readonly RaceCar[], time: number): void {
    const { car, circuit: c } = this;
    const v = Math.max(car.speed, 0);
    const i = car.index;

    // Closest car ahead in our lane, and the side to pass it on.
    let blockGap = Infinity, blockSpeed = 0, desiredAvoid = 0;
    const myLine = c.lineOffset[i] + this.avoid;
    for (const other of cars) {
      if (other === car) continue;
      let gap = other.trackDist - car.trackDist;
      if (gap < -c.length / 2) gap += c.length;
      if (gap > c.length / 2) gap -= c.length;
      if (gap <= 0 || gap > 30 + v * 0.6) continue;
      const lat = other.lateral - myLine;
      if (Math.abs(lat) > 2.8 || gap >= blockGap) continue;
      blockGap = gap;
      blockSpeed = other.speed;
      const room = c.halfWidth - 1.5;
      const passLeft = other.lateral - 3.2, passRight = other.lateral + 3.2;
      let target = lat >= 0 ? passLeft : passRight;
      if (lat >= 0 && passLeft <= -room) target = passRight;
      if (lat < 0 && passRight >= room) target = passLeft;
      desiredAvoid = clamp(target, -room, room) - c.lineOffset[i];
    }
    this.avoid += clamp(desiredAvoid - this.avoid, -4 * dt, 4 * dt);

    // Pure pursuit toward a look-ahead point on the (shifted) racing line.
    const la = c.wrap(i + Math.round((9 + v * 0.42) / c.ds));
    const wobble = Math.sin(time * 0.3 + this.wobblePhase) * 0.5;
    const off = clamp(c.lineOffset[la] + this.avoid + wobble, -c.halfWidth + 1.3, c.halfWidth - 1.3);
    const dx = c.px[la] + c.rx[la] * off - car.x;
    const dz = c.pz[la] + c.rz[la] * off - car.z;
    const sh = Math.sin(car.heading), ch = Math.cos(car.heading);
    const alpha = Math.atan2(dx * -ch + dz * sh, dx * sh + dz * ch);
    const wheel = Math.atan((2 * CAR_SPECS.wheelBase * Math.sin(alpha)) / Math.hypot(dx, dz));
    let steer = clamp(wheel / (CAR_SPECS.maxSteer / (1 + v / 20)), -1, 1);

    // Speed from the profile, anticipating slightly ahead.
    const ahead = c.wrap(i + Math.round((v * 0.25) / c.ds));
    let target = Math.min(this.profile[i], this.profile[ahead]);
    if (car.surface === "grass") target = Math.min(target, 35);
    if (blockGap < 12 + v * 0.3 && Math.abs(this.avoid - desiredAvoid) > 1) {
      target = Math.min(target, blockSpeed - 1);
    }
    let throttle = clamp((target - v) * 0.35 + 0.1, 0, 1);
    let brake = clamp((v - target) * 0.25, 0, 1);
    if (brake > 0.05) throttle = 0;

    // Reverse out when stuck against something.
    if (v < 2 && throttle > 0.5) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt);
    if (this.stuckTime > 1.5) {
      this.reverseTime = 1.2;
      this.stuckTime = 0;
    }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      throttle = 0;
      brake = 1;
      steer = -steer;
    }
    // Hopelessly lost (e.g. facing backwards off track): reset.
    const facing = Math.cos(car.heading - c.headingAt(i));
    this.lostTime = facing < -0.2 && v < 5 ? this.lostTime + dt : 0;
    if (this.lostTime > 3) {
      car.respawn();
      this.lostTime = 0;
    }

    car.controls.throttle = throttle;
    car.controls.brake = brake;
    car.controls.steer = steer;
  }
}
