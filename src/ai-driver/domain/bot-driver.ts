import type { Circuit } from "@/circuit/domain/circuit";
import { CAR_SPECS } from "@/race-car/domain/car-specs";
import type { RaceCar } from "@/race-car/domain/race-car";
import { steerToward } from "@/race-car/domain/steering";
import { clamp, type RandomSource } from "@/shared/domain/math";
import { computeSpeedProfile } from "./speed-profile";

/** Seconds a bot may sit stuck on the grass before being recovered onto the track. */
const BEACHED_LIMIT = 6;

/** How a bot reacts to a car sitting in its slipstream. */
export const DEFENCE = {
  /** Tow strength that counts as "someone is drafting me". */
  towThreshold: 0.2,
  /** Seconds of being followed before the bot reacts. */
  detectTime: 0.4,
  /** Chance of moving out of the way each time it decides. */
  chance: 0.85,
  /** How far off the follower's line to move, past the edge of the wake (m). */
  sidestep: 3.4,
  minSpeed: 40,
  /** Back to the racing line once the follower has been gone this long (s). */
  releaseTime: 2,
  /** Wait this long before deciding again after choosing not to defend (s). */
  retryDelay: 1.5,
  /** Never move across a follower closer than this (m): it would have no time to react. */
  minFollowerGap: 3,
} as const;

/** Sitting in a leader's wake, then pulling out to pass once close enough. */
export const SLIPSTREAM_ATTACK = {
  minSpeed: 45,
  /** Pull out to pass at this gap plus a bit more the faster we go (m). */
  passGap: 11,
  passGapPerSpeed: 0.12,
  /** The leader must not be much slower than us, or there is no point queuing behind. */
  maxSpeedDeficit: 8,
  /** While pulling out from the wake, keep the speed only if closing slower than this (m/s) and not closer than the gap (m). */
  maxClosingSpeed: 6,
  minGap: 9,
  /** How long after leaving the wake the bot still counts as slingshotting (s). */
  slingshotTime: 1.2,
} as const;

/** How a bot drives, beyond how fast its car is: what the difficulty level changes. */
export interface DrivingStyle {
  /** Sideways drift of its line (m); a cleaner driver drifts less. */
  wobble: number;
  /** Share of the car's braking it uses. */
  braking: number;
  /** Chance of moving out of the way of a car drafting it. */
  defence: number;
}

export const DEFAULT_STYLE: DrivingStyle = { wobble: 0.5, braking: 0.8, defence: DEFENCE.chance };

/**
 * Drives a RaceCar along the racing line: pure-pursuit steering, a
 * pre-computed speed profile for throttle/brake, overtaking (using the
 * slipstream when there is one), defending against cars drafting it, and
 * recovery when stuck or facing the wrong way.
 */
export class BotDriver {
  private profile: Float32Array;
  /** Grip factor the speed profile was built for, and when it was last checked. */
  private profileGrip = 1;
  private profileCheck = 0;
  private avoid = 0; // extra lateral offset used to pass other cars
  private readonly wobblePhase: number;
  private stuckTime = 0;
  private reverseTime = 0;
  private lostTime = 0;
  /** Seconds spent almost stopped on the grass; past a point the car is put back on the asphalt. */
  private beachedFor = 0;
  /** Seconds a car has been drafting us / has been gone since. */
  private tailedFor = 0;
  private followerGoneFor = 0;
  private defending = false;
  /** Track position (lateral, m) held while defending. */
  private defenceLateral = 0;
  /** One defensive move per straight, as in F1; corners reset it. */
  private moveAllowed = true;
  private retryIn = 0;
  private movesMade = 0;
  /** Time left in which a pull-out from a leader's wake keeps its speed. */
  private slingshotFor = 0;

  constructor(
    private readonly car: RaceCar,
    private readonly circuit: Circuit,
    private readonly skill: number,
    private readonly random: RandomSource = Math.random,
    private readonly style: DrivingStyle = DEFAULT_STYLE,
  ) {
    this.profileGrip = car.gripFactor;
    this.profile = this.buildProfile(car.gripFactor);
    this.wobblePhase = random() * 100;
  }

  /** Speed profile for the grip the tyres and track give: bots slow down when it rains. */
  private buildProfile(gripFactor: number): Float32Array {
    return computeSpeedProfile(this.circuit, {
      grip: CAR_SPECS.grip * this.skill * gripFactor,
      brake: CAR_SPECS.brakeDecel * this.style.braking * this.skill * (0.5 + 0.5 * Math.min(1.12, gripFactor)),
      topSpeed: this.car.topSpeed,
      accel: CAR_SPECS.engineAccel * (0.6 + 0.4 * Math.min(1, gripFactor)) * this.car.engineBoost,
    });
  }

  /** Rebuilds the speed profile when the grip has moved enough to matter. */
  private refreshProfile(time: number): void {
    if (time - this.profileCheck < 0.5) return;
    this.profileCheck = time;
    if (Math.abs(this.car.gripFactor - this.profileGrip) < 0.02) return;
    this.profileGrip = this.car.gripFactor;
    this.profile = this.buildProfile(this.profileGrip);
  }

  /** Defensive moves made against drafting cars so far. */
  get defensiveMoves(): number {
    return this.movesMade;
  }

  update(dt: number, cars: readonly RaceCar[], time: number): void {
    const { car, circuit: c } = this;
    this.refreshProfile(time);
    const v = Math.max(car.speed, 0);
    const i = car.index;
    const room = c.halfWidth - 1.5;

    // Speed the profile allows here, and whether this is a clear stretch (no braking, no bend).
    const ahead = c.wrap(i + Math.round((v * 0.25) / c.ds));
    const profileTarget = Math.min(this.profile[i], this.profile[ahead]);
    const lookAhead = c.wrap(i + Math.round((v * 1.5) / c.ds));
    const straight =
      Math.abs(c.curv[i]) < 1 / 400 && Math.abs(c.curv[lookAhead]) < 1 / 300 && profileTarget >= v - 4;
    if (Math.abs(c.curv[i]) > 1 / 150) this.moveAllowed = true; // a corner ends the straight
    this.slingshotFor = Math.max(0, this.slingshotFor - dt);
    this.updateDefence(dt, cars, v, straight);

    // Closest car ahead in our lane, and the side to pass it on. A leader whose
    // slipstream we are in is followed rather than passed, until close enough.
    let blockGap = Infinity, blockSpeed = 0, desiredAvoid = 0;
    let wakeLeader: RaceCar | null = null;
    const myLine = c.lineOffset[i] + this.avoid;
    for (const other of cars) {
      if (other === car) continue;
      let gap = other.trackDist - car.trackDist;
      if (gap < -c.length / 2) gap += c.length;
      if (gap > c.length / 2) gap -= c.length;
      if (gap <= 0 || gap > 30 + v * 0.6) continue;
      const lat = other.lateral - myLine;
      if (Math.abs(lat) > 2.8 || gap >= blockGap) continue;
      if (this.shouldTuckIn(other, gap, v, straight)) {
        wakeLeader = other;
        this.slingshotFor = SLIPSTREAM_ATTACK.slingshotTime;
        continue;
      }
      blockGap = gap;
      blockSpeed = other.speed;
      const passLeft = other.lateral - 3.2, passRight = other.lateral + 3.2;
      let target = lat >= 0 ? passLeft : passRight;
      if (lat >= 0 && passLeft <= -room) target = passRight;
      if (lat < 0 && passRight >= room) target = passLeft;
      desiredAvoid = clamp(target, -room, room) - c.lineOffset[i];
    }
    if (blockGap === Infinity) {
      if (wakeLeader) desiredAvoid = clamp(wakeLeader.lateral, -room, room) - c.lineOffset[i];
      else if (this.defending) desiredAvoid = clamp(this.defenceLateral, -room, room) - c.lineOffset[i];
    }
    this.avoid += clamp(desiredAvoid - this.avoid, -4 * dt, 4 * dt);

    // Pure pursuit toward a look-ahead point on the (shifted) racing line.
    const la = c.wrap(i + Math.round((9 + v * 0.42) / c.ds));
    const wobble = Math.sin(time * 0.3 + this.wobblePhase) * this.style.wobble;
    const off = clamp(c.lineOffset[la] + this.avoid + wobble, -c.halfWidth + 1.3, c.halfWidth - 1.3);
    let steer = steerToward(car, c.px[la] + c.rx[la] * off, c.pz[la] + c.rz[la] * off, v);

    // Speed from the profile, anticipating slightly ahead.
    let target = profileTarget;
    if (car.surface === "grass") target = Math.min(target, 35);
    // Wait until clear of the car ahead before closing on it, unless we are
    // riding its tow and only a little faster (the slingshot).
    const slingshot =
      this.slingshotFor > 0 &&
      blockGap >= SLIPSTREAM_ATTACK.minGap &&
      v - blockSpeed <= SLIPSTREAM_ATTACK.maxClosingSpeed;
    if (blockGap < 12 + v * 0.3 && Math.abs(this.avoid - desiredAvoid) > 1 && !slingshot) {
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
    // Beached on the grass (e.g. after spinning off with the wrong tyres): put back on the track.
    this.beachedFor = car.surface === "grass" && v < 4 ? this.beachedFor + dt : 0;
    if (this.beachedFor > BEACHED_LIMIT) {
      car.respawn();
      this.beachedFor = 0;
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

  /** Queue up in the leader's wake on a clear stretch, and pull out once close. */
  private shouldTuckIn(other: RaceCar, gap: number, v: number, straight: boolean): boolean {
    const passGap = SLIPSTREAM_ATTACK.passGap + v * SLIPSTREAM_ATTACK.passGapPerSpeed;
    return (
      !this.defending &&
      straight &&
      this.car.towSource === other &&
      v > SLIPSTREAM_ATTACK.minSpeed &&
      other.speed > v - SLIPSTREAM_ATTACK.maxSpeedDeficit &&
      gap > passGap
    );
  }

  /**
   * Notices a car drafting us and, with high probability, steps out of its
   * line so the tow is lost. Like F1's rule: one move per straight, never
   * under braking or in a bend.
   */
  private updateDefence(dt: number, cars: readonly RaceCar[], v: number, straight: boolean): void {
    const { car, circuit: c } = this;
    let follower: RaceCar | null = null, followerGap = Infinity;
    for (const other of cars) {
      if (other.towSource !== car || other.tow < DEFENCE.towThreshold) continue;
      if (!follower || other.tow > follower.tow) {
        follower = other;
        followerGap = Math.hypot(other.x - car.x, other.z - car.z) - CAR_SPECS.length;
      }
    }

    this.retryIn = Math.max(0, this.retryIn - dt);
    if (follower) {
      this.tailedFor += dt;
      this.followerGoneFor = 0;
    } else {
      this.tailedFor = Math.max(0, this.tailedFor - 2 * dt);
      this.followerGoneFor += dt;
    }
    if (this.defending && (!straight || this.followerGoneFor > DEFENCE.releaseTime)) this.defending = false;

    const canDefend = !this.defending && this.moveAllowed && straight && v > DEFENCE.minSpeed;
    if (!follower || !canDefend || this.tailedFor < DEFENCE.detectTime || this.retryIn > 0) return;
    if (followerGap < DEFENCE.minFollowerGap) return; // too close to move across safely
    this.tailedFor = 0;
    if (this.random() >= this.style.defence) {
      this.retryIn = DEFENCE.retryDelay;
      return;
    }

    // Move to the far side of the follower's line, the way with room to do it.
    const room = c.halfWidth - 1.5;
    const away = car.lateral >= follower.lateral ? 1 : -1;
    let target = follower.lateral + away * DEFENCE.sidestep;
    if (Math.abs(target) > room) target = follower.lateral - away * DEFENCE.sidestep;
    if (Math.abs(target) > room) return; // no room on either side
    this.defenceLateral = target;
    this.defending = true;
    this.moveAllowed = false;
    this.movesMade++;
  }
}
