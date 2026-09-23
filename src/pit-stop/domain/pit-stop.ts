import type { Circuit } from "@/circuit/domain/circuit";
import type { RaceCar } from "@/race-car/domain/race-car";
import { steerToward } from "@/race-car/domain/steering";
import { clamp, randomBetween, type RandomSource } from "@/shared/domain/math";
import { Tyre, type Compound } from "@/tyres/domain/tyre";
import { PIT, PitLane } from "./pit-lane";

export type PitPhase = "none" | "approach" | "service" | "exit";
export type ExitLight = "red" | "green";

/** Seconds the crew needs to change four tyres, and how long the player has to choose them. */
const SERVICE_TIME: readonly [number, number] = [2.3, 3.2];
export const CHOICE_TIMEOUT = 8;
/** A stop that goes nowhere (e.g. after a collision) is abandoned after this long. */
const STUCK_TIMEOUT = 10;
const APPROACH_DECEL = 16;
const BOX_DECEL = 7;
/** How far from the exact spot a car may stop and still count as in its box (m). */
const BOX_TOLERANCE = 2.5;
const COOLDOWN_AFTER_STOP = 40;
/** A car may not leave its box with another pit car this close behind it (m), or wait longer than this (s). */
const RELEASE_GAP_BEHIND = 30;
const RELEASE_GAP_AHEAD = 20;
/** Even when the wait has run out, do not release with a car this close. */
const RELEASE_HARD_AHEAD = 12;
const RELEASE_HARD_BEHIND = 16;
const MAX_RELEASE_WAIT = 10;
/** Longest a car waits at a red exit light before going anyway (s). */
const MAX_LIGHT_WAIT = 12;
/** The exit light turns red when a car on the track could reach the merge within this time (s). */
const LIGHT_WARNING_TIME = 4.5;
/** Following distances between pit cars: how far to look, how much to leave, and how hard to plan on braking. */
const FOLLOW_LOOKAHEAD = 70;
const FOLLOW_MARGIN = 3;
const FOLLOW_DECEL = 12;
const CAR_LENGTH = 5.4;

/** Where a car is in its pit stop, and what it has asked for. */
export class PitStop {
  /** The driver has asked to come in on the next lap. */
  requested = false;
  phase: PitPhase = "none";
  readonly box: number;
  /** Tyres fitted at the stop; the player picks them in the box. */
  compound: Compound | null = null;
  /** Stopped in the box, waiting for the player to pick tyres. */
  waitingForChoice = false;
  choiceWait = 0;
  serviceLeft = 0;
  /** Length of the current service, for animating the crew. */
  serviceTotal = 0;
  /** The crew has finished and the car is waiting for a safe gap to leave. */
  waitingToRelease = false;
  releaseWait = 0;
  /** Held at the exit line by the red light. */
  waitingForLight = false;
  lightWait = 0;
  stops = 0;
  /** Time before another stop can be requested. */
  cooldown = 0;
  startLateral = 0;
  served = false;
  /** Seconds stopped outside the box; a stop that goes nowhere is abandoned. */
  stuckFor = 0;

  constructor(box: number) {
    this.box = box;
  }

  get active(): boolean {
    return this.phase !== "none";
  }
}

/** What the pit crew needs to know about each car. */
export interface PitParticipant {
  readonly car: RaceCar;
  readonly pit: PitStop;
  readonly isPlayer: boolean;
  readonly finished: boolean;
}

/**
 * The pit lane and the people in it: takes over cars that come in, keeps them
 * at the limit and out of each other's way, changes the tyres, and lets them
 * go when the lane is clear and the exit light is green.
 */
export class PitCrew {
  readonly lane: PitLane;
  /** Red while a car on the track is about to pass the pit exit. */
  exitLight: ExitLight = "green";

  constructor(
    circuit: Circuit,
    private readonly random: RandomSource,
    /** Tyres to fit when the player takes too long to choose. */
    private readonly fallbackCompound: () => Compound,
  ) {
    this.lane = new PitLane(circuit);
  }

  /** Call once per step, before `update`: sets the exit light from the traffic on the track. */
  observe(participants: readonly PitParticipant[]): void {
    const { lane } = this;
    let red = false;
    for (const { car, pit, finished } of participants) {
      if (pit.active || finished || car.speed < 12) continue;
      const toMerge = lane.exitEnd - lane.signed(car.trackDist);
      // Anything about to pass, or already alongside, the stretch where pit cars rejoin.
      if (toMerge > -25 && toMerge < car.speed * LIGHT_WARNING_TIME + 40 && toMerge < lane.exitEnd - lane.exitLine + 220) red = true;
    }
    this.exitLight = red ? "red" : "green";
  }

  /** Runs one step for a car; returns true while the crew (not the driver) is in control of it. */
  update(dt: number, self: PitParticipant, canPit: boolean, all: readonly PitParticipant[]): boolean {
    const { car, pit } = self;
    pit.cooldown = Math.max(0, pit.cooldown - dt);
    const u = this.lane.signed(car.trackDist);
    if (pit.phase === "none") {
      if (pit.requested && canPit && pit.cooldown === 0) this.tryEngage(car, pit, u);
      return pit.active;
    }

    switch (pit.phase) {
      case "approach":
        this.drive(dt, self, u, all);
        if (this.atBox(car, pit, u)) this.arrive(self);
        break;
      case "service":
        car.halt(); // parked: no rolling, and no reversing out of the box
        this.hold(car);
        this.service(dt, self, u, all);
        break;
      case "exit":
        this.drive(dt, self, u, all);
        if (u >= this.lane.exitEnd) this.finish(car, pit);
        break;
    }
    this.watchForStuck(dt, car, pit);
    return pit.active;
  }

  /** Puts a stopped car back under its own driver, giving up on the stop. */
  abandon(car: RaceCar, pit: PitStop): void {
    pit.phase = "none";
    pit.requested = false;
    pit.waitingForChoice = false;
    pit.waitingToRelease = false;
    pit.waitingForLight = false;
    pit.cooldown = COOLDOWN_AFTER_STOP;
    car.inPit = false;
  }

  private tryEngage(car: RaceCar, pit: PitStop, u: number): void {
    // Take over early enough to brake down to the pit limit before the entry road,
    // but never once there is too little road left to do it: try again next lap.
    const v = Math.max(car.speed, 0);
    const braking = Math.max(40, (v * v - PIT.speedLimit ** 2) / (2 * APPROACH_DECEL)) * 1.15;
    if (u < PIT.entryStart - braking - 60 || u >= PIT.entryStart - braking) return;
    pit.phase = "approach";
    pit.startLateral = clamp(car.lateral, -6, 8);
    pit.served = false;
    pit.waitingForLight = false;
    pit.lightWait = 0;
    car.inPit = true;
  }

  private atBox(car: RaceCar, pit: PitStop, u: number): boolean {
    const boxU = this.lane.boxPosition(pit.box);
    return u > boxU - BOX_TOLERANCE && u < boxU + BOX_TOLERANCE * 2 && Math.abs(car.speed) < 0.7;
  }

  private arrive(self: PitParticipant): void {
    const { car, pit, isPlayer } = self;
    pit.phase = "service";
    pit.choiceWait = 0;
    pit.waitingToRelease = false;
    pit.releaseWait = 0;
    if (isPlayer && !pit.compound) {
      pit.waitingForChoice = true;
    } else {
      pit.compound ??= this.fallbackCompound();
      this.startService(pit);
    }
    car.halt();
  }

  private startService(pit: PitStop): void {
    pit.serviceLeft = pit.serviceTotal = randomBetween(SERVICE_TIME, this.random);
  }

  private service(dt: number, self: PitParticipant, u: number, all: readonly PitParticipant[]): void {
    const { car, pit } = self;
    if (pit.waitingForChoice) {
      pit.choiceWait += dt;
      if (!pit.compound && pit.choiceWait < CHOICE_TIMEOUT) return;
      pit.compound ??= this.fallbackCompound();
      pit.waitingForChoice = false;
      this.startService(pit);
      return;
    }
    if (pit.serviceLeft > 0) {
      pit.serviceLeft -= dt;
      if (pit.serviceLeft > 0 || !pit.compound) return;
      car.tyre = new Tyre(pit.compound);
      pit.compound = null;
      pit.served = true;
      pit.stops++;
      pit.requested = false;
      pit.waitingToRelease = true;
      pit.releaseWait = 0;
    }
    // Tyres are on: leave only when the fast lane is clear, with no other car pulling out or coming up.
    pit.releaseWait += dt;
    if (this.laneBusy(self, u, all, pit.releaseWait >= MAX_RELEASE_WAIT)) return;
    pit.waitingToRelease = false;
    pit.phase = "exit";
  }

  /**
   * Another car is pulling out or coming up. After waiting a long time the team
   * lets the car go anyway, but never into a car that is right on top of it.
   */
  private laneBusy(self: PitParticipant, u: number, all: readonly PitParticipant[], impatient: boolean): boolean {
    const ahead = impatient ? RELEASE_HARD_AHEAD : RELEASE_GAP_AHEAD;
    const behindLimit = impatient ? RELEASE_HARD_BEHIND : RELEASE_GAP_BEHIND;
    for (const other of all) {
      if (other === self || !other.pit.active || other.pit.phase === "service") continue;
      const behind = u - this.lane.signed(other.car.trackDist); // > 0: the other car is behind us
      if (behind > -ahead && behind < behindLimit) return true;
    }
    return false;
  }

  private finish(car: RaceCar, pit: PitStop): void {
    pit.phase = "none";
    pit.cooldown = COOLDOWN_AFTER_STOP;
    pit.waitingForLight = false;
    car.inPit = false;
  }

  /** Never brakes into reverse: below walking pace the brake pedal is simply released. */
  private hold(car: RaceCar): void {
    car.controls.throttle = 0;
    car.controls.brake = car.speed > 0.5 ? 1 : 0;
    car.controls.steer = 0;
  }

  /** Autopilot: follow the pit road at the limit, stopping at the box and at a red light. */
  private drive(dt: number, self: PitParticipant, u: number, all: readonly PitParticipant[]): void {
    const { car, pit } = self;
    const v = Math.max(car.speed, 0);
    const boxU = this.lane.boxPosition(pit.box);
    let target: number = PIT.speedLimit;
    if (u < PIT.entryStart) target = Math.sqrt(PIT.speedLimit ** 2 + 2 * APPROACH_DECEL * (PIT.entryStart - u));
    if (!pit.served && u <= boxU + BOX_TOLERANCE) {
      // Brake to a stop on the box; a car that slides a little past it just stays where it is.
      target = Math.min(target, u <= boxU ? Math.sqrt(2 * BOX_DECEL * (boxU - u) + 0.09) : 0);
    }
    if (pit.served && u < this.lane.exitLine) target = Math.min(target, this.lightTarget(dt, pit, u));
    target = Math.min(target, this.followTarget(self, u, all));

    const ahead = u + 2.5 + v * 0.3; // short reach: pit manoeuvres are tight
    const p = this.lane.pointAt(ahead, pit.startLateral, pit.box, pit.served);
    car.controls.steer = steerToward(car, p.x, p.z, v);
    car.controls.throttle = target > 0.4 ? clamp((target - v) * 0.5 + 0.05, 0, 1) : 0;
    car.controls.brake = v > 0.6 ? clamp((v - target) * 0.4, 0, 1) : 0;
    if (car.controls.brake > 0.05) car.controls.throttle = 0;
  }

  /** Stops at the exit line while the light is red, up to a time limit. */
  private lightTarget(dt: number, pit: PitStop, u: number): number {
    const line = this.lane.exitLine;
    const toLine = line - u;
    if (this.exitLight === "green" || pit.lightWait > MAX_LIGHT_WAIT) {
      pit.waitingForLight = false;
      return PIT.speedLimit;
    }
    if (toLine > 40) return PIT.speedLimit;
    if (toLine < 3) pit.waitingForLight = true;
    if (pit.waitingForLight) pit.lightWait += dt;
    return Math.sqrt(2 * BOX_DECEL * Math.max(0, toLine) + 0.09) * (toLine < 0.5 ? 0 : 1);
  }

  /** Speed at which the car could still stop behind the pit car ahead of it in the same lane. */
  private followTarget(self: PitParticipant, u: number, all: readonly PitParticipant[]): number {
    let target = Infinity;
    for (const other of all) {
      if (other === self || !other.pit.active || other.pit.phase === "service") continue;
      if (Math.abs(other.car.lateral - self.car.lateral) > 4.5) continue;
      const gap = this.lane.signed(other.car.trackDist) - u - CAR_LENGTH;
      if (gap < -CAR_LENGTH || gap > FOLLOW_LOOKAHEAD) continue;
      const room = Math.max(0, gap - FOLLOW_MARGIN);
      target = Math.min(target, Math.sqrt(Math.max(0, other.car.speed) ** 2 + 2 * FOLLOW_DECEL * room));
    }
    return target;
  }

  private watchForStuck(dt: number, car: RaceCar, pit: PitStop): void {
    if (pit.phase === "service" || pit.waitingForLight || Math.abs(car.speed) > 1) {
      pit.stuckFor = 0;
      return;
    }
    pit.stuckFor += dt;
    if (pit.stuckFor > STUCK_TIMEOUT) this.abandon(car, pit);
  }
}
