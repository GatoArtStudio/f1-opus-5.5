import { BotDriver } from "@/ai-driver/domain/bot-driver";
import type { Circuit } from "@/circuit/domain/circuit";
import type { CarControls } from "@/race-car/domain/car-controls";
import { RaceCar } from "@/race-car/domain/race-car";
import { DIFFICULTY_LEVELS, type RaceSettings } from "@/race-setup/domain/race-settings";
import { randomBetween, shuffle, type RandomSource } from "@/shared/domain/math";
import { resolveCarCollisions } from "./car-collisions";
import { DRIVER_ROSTER, PLAYER_DRIVER } from "./driver";
import { RaceEntry } from "./race-entry";

export type RaceEvent =
  | { type: "fastest-lap"; entry: RaceEntry; lapTime: number }
  | { type: "final-lap"; entry: RaceEntry }
  | { type: "finished"; entry: RaceEntry; position: number };

/** Interval to the leader, as shown on a timing tower. */
export type Gap =
  | { kind: "leader"; finished: boolean }
  | { kind: "time"; seconds: number; precise: boolean }
  | { kind: "laps"; laps: number }
  | { kind: "unknown" };

export interface Standing {
  entry: RaceEntry;
  gap: Gap;
}

const GRID_FIRST_ROW = 12; // metres behind the line
const GRID_SPACING = 8;
const GRID_LATERAL = 3.5;
const GAP_BUCKET = 10; // metres between leader timing references

/**
 * A race on a circuit: grid, simulation step, lap counting, finishing order
 * and interval timing. Emits domain events for notable moments.
 */
export class Race {
  readonly entries: RaceEntry[];
  readonly player: RaceEntry;
  readonly cars: RaceCar[];
  /** Race clock since lights out. */
  time = 0;
  fastestLap = Infinity;
  fastestBy: RaceEntry | null = null;

  private readonly bots: BotDriver[];
  /** Takes over the player's car in attract mode and after the chequered flag. */
  private readonly playerBot: BotDriver;
  /** Time the leader first reached each GAP_BUCKET of distance. */
  private readonly leaderTimes: number[] = [];
  private events: RaceEvent[] = [];

  private constructor(
    private readonly circuit: Circuit,
    readonly totalLaps: number,
    readonly attractMode: boolean,
    entries: RaceEntry[],
    bots: BotDriver[],
    random: RandomSource,
  ) {
    this.entries = entries;
    this.cars = entries.map((e) => e.car);
    this.player = entries.find((e) => e.isPlayer)!;
    this.bots = bots;
    this.playerBot = new BotDriver(this.player.car, circuit, 0.9, random);
  }

  static create(
    circuit: Circuit,
    settings: RaceSettings,
    { attractMode = false, random = Math.random }: { attractMode?: boolean; random?: RandomSource } = {},
  ): Race {
    const level = DIFFICULTY_LEVELS[settings.difficulty];
    const count = settings.rivals + 1;
    const slots = { pole: 0, middle: Math.floor(count / 2), back: count - 1 } as const;
    const playerSlot =
      settings.gridSlot === "random" ? Math.floor(random() * count) : slots[settings.gridSlot];

    const rivals = shuffle(DRIVER_ROSTER, random).slice(0, settings.rivals);
    const entries: RaceEntry[] = [];
    const bots: BotDriver[] = [];
    let next = 0;
    for (let slot = 0; slot < count; slot++) {
      const isPlayer = slot === playerSlot;
      const car = new RaceCar(circuit, isPlayer ? 1 : randomBetween(level.topSpeed, random));
      car.placeAt(circuit.length - GRID_FIRST_ROW - slot * GRID_SPACING, slot % 2 ? GRID_LATERAL : -GRID_LATERAL);
      entries.push(new RaceEntry(isPlayer ? PLAYER_DRIVER : rivals[next++], car, slot + 1, isPlayer));
      if (!isPlayer) bots.push(new BotDriver(car, circuit, randomBetween(level.skill, random), random));
    }
    return new Race(circuit, attractMode ? Infinity : settings.laps, attractMode, entries, bots, random);
  }

  /** Grid slot positions, so the view can paint the grid boxes. */
  static gridSlots(circuit: Circuit, count: number) {
    return Array.from({ length: count }, (_, slot) => ({
      dist: circuit.length - GRID_FIRST_ROW - slot * GRID_SPACING,
      lateral: slot % 2 ? GRID_LATERAL : -GRID_LATERAL,
    }));
  }

  /**
   * Advances the simulation. Before lights out (`green` false) the cars stay
   * still. `playerControls` is ignored once the player is driven by the AI.
   */
  step(dt: number, green: boolean, playerControls: CarControls): void {
    const { cars, player } = this;
    if (green) {
      for (const bot of this.bots) bot.update(dt, cars, this.time);
      if (this.attractMode || player.finished) this.playerBot.update(dt, cars, this.time);
      else Object.assign(player.car.controls, playerControls);

      for (const car of cars) car.update(dt);
      resolveCarCollisions(cars);
      for (const car of cars) {
        car.updateTrackPosition();
        car.collideWalls();
      }
    } else {
      for (const car of cars) Object.assign(car.controls, { throttle: 0, brake: 0, steer: 0 });
    }

    const N = this.circuit.n;
    for (const entry of this.entries) {
      const index = entry.car.index;
      if (entry.prevIndex > N * 0.75 && index < N * 0.25) this.crossLine(entry);
      else if (entry.prevIndex < N * 0.25 && index > N * 0.75) entry.lap--;
      entry.prevIndex = index;
      entry.progress = (entry.lap - 1) * this.circuit.length + entry.car.trackDist;
    }
    if (green) this.time += dt;
  }

  private crossLine(entry: RaceEntry): void {
    entry.lap++;
    if (entry.lap <= entry.maxLap) return; // re-crossing after reversing
    entry.maxLap = entry.lap;
    const t = this.time;
    if (entry.lap >= 2) {
      const lapTime = t - entry.lapStart;
      entry.lastLap = lapTime;
      if (!entry.bestLap || lapTime < entry.bestLap) entry.bestLap = lapTime;
      if (lapTime < this.fastestLap) {
        this.fastestLap = lapTime;
        this.fastestBy = entry;
        this.events.push({ type: "fastest-lap", entry, lapTime });
      }
    }
    entry.lapStart = entry.lap >= 2 ? t : 0; // lap 1 is timed from lights out
    if (entry.lap > this.totalLaps && !entry.finished) {
      entry.finished = true;
      entry.finishTime = t;
      const position = this.entries.filter((e) => e.finished).length;
      this.events.push({ type: "finished", entry, position });
    } else if (entry.lap === this.totalLaps && this.totalLaps > 1) {
      this.events.push({ type: "final-lap", entry });
    }
  }

  drainEvents(): RaceEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Finished cars by finish time, then everyone else by distance covered. */
  standings(): Standing[] {
    const order = [...this.entries].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    order.forEach((e, i) => (e.position = i + 1));

    const leader = order[0];
    const times = this.leaderTimes;
    const leaderBucket = Math.floor(Math.max(0, leader.progress) / GAP_BUCKET);
    for (let b = times.length; b <= leaderBucket; b++) times[b] = this.time;

    const L = this.circuit.length;
    return order.map((entry, i): Standing => {
      if (i === 0) return { entry, gap: { kind: "leader", finished: entry.finished } };
      if (entry.finished) {
        return { entry, gap: { kind: "time", seconds: entry.finishTime - leader.finishTime, precise: true } };
      }
      const behind = leader.progress - entry.progress;
      if (!leader.finished && behind > L) return { entry, gap: { kind: "laps", laps: Math.floor(behind / L) } };
      if (leader.finished && entry.lap < this.totalLaps) {
        return { entry, gap: { kind: "laps", laps: this.totalLaps - entry.lap + 1 } };
      }
      const reference = times[Math.floor(Math.max(0, entry.progress) / GAP_BUCKET)];
      if (reference === undefined) return { entry, gap: { kind: "unknown" } };
      return { entry, gap: { kind: "time", seconds: Math.max(0, this.time - reference), precise: false } };
    });
  }

  /** The player is driving against the direction of the lap. */
  isPlayerWrongWay(): boolean {
    const car = this.player.car;
    const i = car.index;
    const dot = Math.sin(car.heading) * this.circuit.tx[i] + Math.cos(car.heading) * this.circuit.tz[i];
    return dot < -0.3 && car.speed > 3;
  }
}
