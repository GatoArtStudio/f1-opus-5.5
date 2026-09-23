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
  /** 0-1: how eager it is to go for a gap and stay close to the car ahead. */
  aggression: number;
  /** 0-1: how much of its pace it keeps when there is little grip (1 = all of it). */
  wetSkill: number;
  /** Slips per lap: a moment running wide in a corner, or lifting off on a straight. */
  mistakesPerLap: number;
  /** Seconds it takes to react to the lights going out. */
  startDelay: number;
  /** Multiplier on how long it takes to notice a car drafting it (1 = usual). */
  detection: number;
}

export const DEFAULT_STYLE: DrivingStyle = {
  wobble: 0.5,
  braking: 0.8,
  defence: DEFENCE.chance,
  aggression: 0.5,
  wetSkill: 1,
  mistakesPerLap: 0,
  startDelay: 0,
  detection: 1,
};

/** A slip: how long it lasts, and what it does to the bot's speed and steering. */
const SLIP = {
  /** Runs wide: less steering and more speed than the corner allows. */
  wide: { seconds: 1.2, steering: 0.5, speed: 1.06 },
  /** Lifts off: holds this share of the speed it had when the slip began. */
  lift: { seconds: 1.5, steering: 1, speed: 0.82 },
  /** Nothing goes wrong again for this long afterwards (s). */
  cooldown: 10,
  /** Seconds into the race before slips can happen, and the speed under which they cannot. */
  after: 10,
  minSpeed: 30,
} as const;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Share of cornering grip a driver with no feel for the wet gives up on a soaked track. */
const WET_HOLD_BACK = 0.16;

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
  private profileWetness = 0;
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
  /** A slip in progress, and how long until another is possible. */
  private slipLeft = 0;
  private slip: "wide" | "lift" | null = null;
  private slipSpeed = 0;
  private slipCooldown = 0;

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
    // A driver who is poor in the wet holds back more the wetter (or more covered) the track is.
    const wet = 1 - WET_HOLD_BACK * (1 - this.style.wetSkill) * this.wetness();
    return computeSpeedProfile(this.circuit, {
      grip: CAR_SPECS.grip * this.skill * gripFactor * wet,
      brake: CAR_SPECS.brakeDecel * this.style.braking * this.skill * (0.5 + 0.5 * Math.min(1.12, gripFactor)),
      topSpeed: this.car.topSpeed,
      accel: CAR_SPECS.engineAccel * (0.6 + 0.4 * Math.min(1, gripFactor)) * this.car.engineBoost,
    });
  }

  /** How wet or covered the track is, 0-1. */
  private wetness(): number {
    const { water, loose } = this.car.conditions;
    return clamp(water + loose, 0, 1);
  }

  /** Rebuilds the speed profile when the grip, or how wet the track is, has moved enough to matter. */
  private refreshProfile(time: number): void {
    if (time - this.profileCheck < 0.5) return;
    this.profileCheck = time;
    const wetness = this.wetness();
    if (Math.abs(this.car.gripFactor - this.profileGrip) < 0.02 && Math.abs(wetness - this.profileWetness) < 0.05) return;
    this.profileGrip = this.car.gripFactor;
    this.profileWetness = wetness;
    this.profile = this.buildProfile(this.profileGrip);
  }

  /** Defensive moves made against drafting cars so far. */
  get defensiveMoves(): number {
    return this.movesMade;
  }

  update(dt: number, cars: readonly RaceCar[], time: number): void {
    const { car, circuit: c } = this;
    if (time < this.style.startDelay) {
      // Not away yet: still reacting to the lights.
      Object.assign(car.controls, { throttle: 0, brake: 0, steer: 0 });
      return;
    }
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
      const passOffset = lerp(3.6, 2.8, this.style.aggression); // an aggressive driver passes closer
      const passLeft = other.lateral - passOffset, passRight = other.lateral + passOffset;
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
      v - blockSpeed <= SLIPSTREAM_ATTACK.maxClosingSpeed * lerp(0.7, 1.3, this.style.aggression);
    const caution = lerp(1.2, 0.8, this.style.aggression); // how far back it starts to wait for the car ahead
    if (blockGap < (12 + v * 0.3) * caution && Math.abs(this.avoid - desiredAvoid) > 1 && !slingshot) {
      target = Math.min(target, blockSpeed - 1);
    }
    // A slip: running wide in a corner, or a lift on a straight.
    this.updateSlip(dt, v, i, time);
    if (this.slip === "wide") {
      steer *= SLIP.wide.steering;
      target *= SLIP.wide.speed;
    } else if (this.slip === "lift") {
      target = Math.min(target, this.slipSpeed);
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

  /** Now and then a driver who is not consistent makes a small slip, at a rate that follows their stats. */
  private updateSlip(dt: number, v: number, index: number, time: number): void {
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);
    if (this.slipLeft > 0) {
      this.slipLeft -= dt;
      if (this.slipLeft <= 0) this.slip = null;
      return;
    }
    const { car, circuit: c, style } = this;
    if (style.mistakesPerLap <= 0 || time < SLIP.after || v < SLIP.minSpeed || car.inPit || this.slipCooldown > 0) return;
    const lapSeconds = c.length / 50;
    if (this.random() >= (style.mistakesPerLap / lapSeconds) * dt) return;
    this.slip = Math.abs(c.curv[index]) > 1 / 300 ? "wide" : "lift";
    this.slipLeft = SLIP[this.slip].seconds;
    this.slipSpeed = v * SLIP.lift.speed;
    this.slipCooldown = SLIP.cooldown;
  }

  /** Queue up in the leader's wake on a clear stretch, and pull out once close. */
  private shouldTuckIn(other: RaceCar, gap: number, v: number, straight: boolean): boolean {
    const passGap = (SLIPSTREAM_ATTACK.passGap + v * SLIPSTREAM_ATTACK.passGapPerSpeed) * lerp(1.25, 0.8, this.style.aggression);
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
    if (!follower || !canDefend || this.tailedFor < DEFENCE.detectTime * this.style.detection || this.retryIn > 0) return;
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
