import { BotDriver } from "@/ai-driver/domain/bot-driver";
import { chooseStartCompound, TyreStrategy } from "@/ai-driver/domain/tyre-strategy";
import type { Circuit } from "@/circuit/domain/circuit";
import type { CarControls } from "@/race-car/domain/car-controls";
import { RaceCar } from "@/race-car/domain/race-car";
import { PitAdvisor } from "@/pit-stop/domain/pit-advisor";
import { PitCrew } from "@/pit-stop/domain/pit-stop";
import { updateWakes } from "@/race-car/domain/slipstream";
import { DIFFICULTY_LEVELS, type RaceSettings } from "@/race-setup/domain/race-settings";
import { clamp, randomBetween, shuffle, type RandomSource } from "@/shared/domain/math";
import { DRY_COMPOUNDS, type MandatoryStop } from "@/tyres/domain/pit-decision";
import { bestCompound, rankCompounds, Tyre, type Compound } from "@/tyres/domain/tyre";
import { WeatherSystem, type WeatherKind } from "@/weather/domain/weather";
import { resolveCarCollisions } from "./car-collisions";
import { DRIVER_ROSTER, PLAYER_DRIVER } from "./driver";
import { RaceEntry } from "./race-entry";

export type RaceEvent =
  | { type: "fastest-lap"; entry: RaceEntry; lapTime: number }
  | { type: "final-lap"; entry: RaceEntry }
  | { type: "finished"; entry: RaceEntry; position: number }
  | { type: "penalty"; entry: RaceEntry; seconds: number };

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

/** Catch-up: seconds behind the player before a bot starts to get help, and how many more for the full push. */
const CATCH_UP_AFTER = 5;
const CATCH_UP_RAMP = 12;
/** Speed used to turn a distance behind into seconds (m/s). */
const CATCH_UP_SPEED = 50;
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

  /** Conditions on the track, changing with the weather; every car reads the same object. */
  readonly weather: WeatherSystem;
  readonly crew: PitCrew;
  /** The team's board for the player: when a stop is worth it, it says so. */
  readonly advisor = new PitAdvisor();
  /** F1 rule: use two different dry compounds in a dry race. */
  readonly mandatoryStop: boolean;
  /** Set once the track has been wet or covered: the rule no longer applies. */
  wetSeen = false;
  /** Seconds added for breaking the two-compound rule. */
  static readonly RULE_PENALTY = 20;
  readonly lapKm: number;
  private readonly bots: { entry: RaceEntry; driver: BotDriver; strategy: TyreStrategy; stopFromLaps: number }[];
  /** Takes over the player's car in attract mode and after the chequered flag. */
  private readonly playerBot: BotDriver;
  /** Time the leader first reached each GAP_BUCKET of distance. */
  private readonly leaderTimes: number[] = [];
  private events: RaceEvent[] = [];

  private constructor(
    private readonly circuit: Circuit,
    readonly totalLaps: number,
    readonly attractMode: boolean,
    mandatoryStop: boolean,
    private readonly catchUp: number,
    entries: RaceEntry[],
    bots: { entry: RaceEntry; driver: BotDriver; strategy: TyreStrategy; stopFromLaps: number }[],
    weather: WeatherSystem,
    random: RandomSource,
  ) {
    this.weather = weather;
    this.mandatoryStop = mandatoryStop && !attractMode && totalLaps >= 3;
    this.lapKm = circuit.length / 1000;
    this.crew = new PitCrew(circuit, random, () => this.recommendedCompound());
    this.entries = entries;
    this.cars = entries.map((e) => e.car);
    this.player = entries.find((e) => e.isPlayer)!;
    this.bots = bots;
    this.playerBot = new BotDriver(this.player.car, circuit, 0.9, random);
  }

  static create(
    circuit: Circuit,
    settings: RaceSettings,
    {
      attractMode = false,
      random = Math.random,
      weather: startWeather,
    }: { attractMode?: boolean; random?: RandomSource; weather?: WeatherKind } = {},
  ): Race {
    const weather = new WeatherSystem(circuit.theme, random, startWeather);
    const lapKm = circuit.length / 1000;
    const planLaps = attractMode ? 3 : settings.laps;
    const level = DIFFICULTY_LEVELS[settings.difficulty];
    const count = settings.rivals + 1;
    const slots = { pole: 0, middle: Math.floor(count / 2), back: count - 1 } as const;
    const playerSlot =
      settings.gridSlot === "random" ? Math.floor(random() * count) : slots[settings.gridSlot];

    const rivals = shuffle(DRIVER_ROSTER, random).slice(0, settings.rivals);
    const entries: RaceEntry[] = [];
    const bots: { entry: RaceEntry; driver: BotDriver; strategy: TyreStrategy; stopFromLaps: number }[] = [];
    let next = 0;
    for (let slot = 0; slot < count; slot++) {
      const isPlayer = slot === playerSlot;
      const car = new RaceCar(circuit, isPlayer ? 1 : randomBetween(level.topSpeed, random));
      car.placeAt(circuit.length - GRID_FIRST_ROW - slot * GRID_SPACING, slot % 2 ? GRID_LATERAL : -GRID_LATERAL);
      car.conditions = weather.conditions;
      const compound =
        isPlayer && settings.startTyre !== "auto"
          ? settings.startTyre
          : isPlayer
            ? bestCompound(weather.conditions, planLaps, lapKm)
            : chooseStartCompound(weather.conditions, planLaps, lapKm, random);
      car.tyre = new Tyre(compound);
      const entry = new RaceEntry(isPlayer ? PLAYER_DRIVER : rivals[next++], car, slot + 1, isPlayer);
      entries.push(entry);
      if (!isPlayer) {
        car.gripBoost = randomBetween(level.grip, random);
        car.engineBoost = randomBetween(level.engine, random);
        const style = { wobble: level.wobble, braking: level.braking, defence: level.defence };
        const driver = new BotDriver(car, circuit, randomBetween(level.skill, random), random, style);
        // Each bot picks its own lap for the mandatory stop, so they do not all pit together.
        const stopFromLaps = planLaps * randomBetween([0.3, 0.6], random);
        bots.push({ entry, driver, strategy: new TyreStrategy(car, entry.pit, lapKm, random), stopFromLaps });
      }
    }
    return new Race(circuit, attractMode ? Infinity : settings.laps, attractMode, settings.mandatoryStop, level.catchUp, entries, bots, weather, random);
  }

  /**
   * Harder levels give a bot that has fallen well behind the player an extra push,
   * so a player who pulls away is still hunted down. Bots ahead of the player get none.
   */
  private applyCatchUp(dt: number, entry: RaceEntry): void {
    const car = entry.car;
    let target = 0;
    if (this.catchUp > 0 && !this.attractMode && !this.player.finished && !entry.pit.active) {
      const secondsBehind = (this.player.progress - entry.progress) / CATCH_UP_SPEED;
      target = clamp((secondsBehind - CATCH_UP_AFTER) / CATCH_UP_RAMP, 0, 1) * this.catchUp;
    }
    car.catchUp += (target - car.catchUp) * Math.min(1, dt * 0.5);
  }

  /** How far a car has gone, in laps. */
  lapsRun(entry: RaceEntry): number {
    return Math.max(0, entry.progress) / this.circuit.length;
  }

  /** Where a car stands on the two-compound rule. */
  stopRule(entry: RaceEntry, fromLaps: number): MandatoryStop {
    return { needed: this.mandatoryStop && !this.wetSeen && entry.dryCompounds.size < 2, fromLaps, used: entry.dryCompounds };
  }

  /** Laps still to run for a car, as a fraction. */
  lapsLeft(entry: RaceEntry): number {
    return this.totalLaps - Math.max(0, entry.progress) / this.circuit.length;
  }

  /** The pit lane is closed before the first lap and on the last one. */
  private canPit(entry: RaceEntry): boolean {
    return !this.attractMode && !entry.finished && entry.lap >= 1 && entry.lap < this.totalLaps;
  }

  get playerCanPit(): boolean {
    return this.canPit(this.player);
  }

  /**
   * Tyre the team would fit the player: the best for the conditions over the
   * rest of the race, and a different dry one while the mandatory stop is owed.
   */
  recommendedCompound(): Compound {
    const laps = Math.max(1, this.lapsLeft(this.player));
    const { conditions } = this.weather;
    const rule = this.stopRule(this.player, 0);
    if (rule.needed && conditions.water <= 0.12 && conditions.loose <= 0.2) {
      const other = rankCompounds(conditions, laps, this.lapKm).find((r) => DRY_COMPOUNDS.includes(r.compound) && !rule.used.has(r.compound));
      if (other) return other.compound;
    }
    return bestCompound(conditions, laps, this.lapKm);
  }

  /** Asks for a pit stop on the next lap, or cancels the request; false when not allowed now. */
  togglePlayerPit(): boolean {
    const { pit } = this.player;
    if (pit.active) return false;
    if (!pit.requested && !this.canPit(this.player)) return false;
    pit.requested = !pit.requested;
    this.advisor.clear(); // the board is answered
    return true;
  }

  /** The player's pick for the tyres to fit while stopped in the box. */
  choosePlayerTyre(compound: Compound): void {
    const { pit } = this.player;
    if (pit.waitingForChoice) pit.compound = compound;
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
    this.weather.step(dt);
    if (this.weather.conditions.water > 0.3 || this.weather.conditions.loose > 0.3) this.wetSeen = true;
    if (green) {
      updateWakes(cars);
      this.crew.observe(this.entries);
      for (const { entry, driver, strategy, stopFromLaps } of this.bots) {
        if (entry.finished && entry.pit.active) this.crew.abandon(entry.car, entry.pit);
        entry.noteTyre();
        this.applyCatchUp(dt, entry);
        if (this.crew.update(dt, entry, this.canPit(entry), this.entries)) continue;
        driver.update(dt, cars, this.time);
        if (!this.attractMode) strategy.update(dt, this.lapsLeft(entry), this.lapsRun(entry), this.stopRule(entry, stopFromLaps));
      }
      if (this.attractMode || player.finished) {
        if (player.finished && player.pit.active) this.crew.abandon(player.car, player.pit);
        this.playerBot.update(dt, cars, this.time);
      } else {
        player.noteTyre();
        if (!this.crew.update(dt, player, this.canPit(player), this.entries)) Object.assign(player.car.controls, playerControls);
        this.advisor.update(dt, player.car, player.pit, this.canPit(player), this.lapsLeft(player), this.lapsRun(player), this.lapKm, this.stopRule(player, this.totalLaps * 0.4));
      }

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
      if (this.mandatoryStop && !this.wetSeen && entry.dryCompounds.size < 2) {
        entry.penalty = Race.RULE_PENALTY;
        this.events.push({ type: "penalty", entry, seconds: entry.penalty });
      }
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
      if (a.finished && b.finished) return a.classifiedTime - b.classifiedTime;
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
        return { entry, gap: { kind: "time", seconds: entry.classifiedTime - leader.classifiedTime, precise: true } };
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
