import type { CircuitThemeId } from "@/circuit/domain/circuit-theme";
import { clamp, type RandomSource } from "@/shared/domain/math";

export type WeatherKind =
  | "clear"
  | "cloudy"
  | "fog"
  | "light-rain"
  | "heavy-rain"
  | "storm"
  | "snow"
  | "blizzard"
  | "sandstorm"
  | "ashfall";

export type Precipitation = "none" | "rain" | "snow" | "sand" | "ash";

export interface WeatherSpec {
  label: string;
  precipitation: Precipitation;
  /** How hard it comes down, 0-1. */
  intensity: number;
  /** Overcast / darkness, 0-1. */
  cloud: number;
  /** Multiplier on how far you can see (1 = clear air). */
  visibility: number;
  lightning: boolean;
  /** Where the water on the track settles while this lasts (0 dry - 1 flooded). */
  water: number;
  /** Where loose cover (snow, sand, ash) settles (0 none - 1 deep). */
  loose: number;
  /** Change in track temperature (°C). */
  tempShift: number;
}

export const WEATHER: Record<WeatherKind, WeatherSpec> = {
  clear: { label: "Despejado", precipitation: "none", intensity: 0, cloud: 0, visibility: 1, lightning: false, water: 0, loose: 0, tempShift: 0 },
  cloudy: { label: "Nublado", precipitation: "none", intensity: 0, cloud: 0.45, visibility: 1, lightning: false, water: 0, loose: 0, tempShift: -3 },
  fog: { label: "Niebla", precipitation: "none", intensity: 0, cloud: 0.3, visibility: 0.22, lightning: false, water: 0.05, loose: 0, tempShift: -2 },
  "light-rain": { label: "Lluvia ligera", precipitation: "rain", intensity: 0.4, cloud: 0.65, visibility: 0.7, lightning: false, water: 0.45, loose: 0, tempShift: -6 },
  "heavy-rain": { label: "Lluvia fuerte", precipitation: "rain", intensity: 0.8, cloud: 0.85, visibility: 0.45, lightning: false, water: 0.9, loose: 0, tempShift: -8 },
  storm: { label: "Tormenta", precipitation: "rain", intensity: 1, cloud: 1, visibility: 0.3, lightning: true, water: 1, loose: 0, tempShift: -10 },
  snow: { label: "Nieve", precipitation: "snow", intensity: 0.5, cloud: 0.6, visibility: 0.5, lightning: false, water: 0.1, loose: 0.55, tempShift: -2 },
  blizzard: { label: "Ventisca", precipitation: "snow", intensity: 1, cloud: 0.85, visibility: 0.2, lightning: false, water: 0.1, loose: 1, tempShift: -4 },
  sandstorm: { label: "Tormenta de arena", precipitation: "sand", intensity: 0.8, cloud: 0.5, visibility: 0.25, lightning: false, water: 0, loose: 0.5, tempShift: 2 },
  ashfall: { label: "Lluvia de ceniza", precipitation: "ash", intensity: 0.6, cloud: 0.7, visibility: 0.4, lightning: false, water: 0, loose: 0.45, tempShift: 3 },
};

/**
 * How likely each weather is when a race starts on a given kind of circuit.
 * Mostly fair weather, as in real life; the theme decides what the bad weather is.
 */
export const START_WEATHER: Record<CircuitThemeId, Partial<Record<WeatherKind, number>>> = {
  forest: { clear: 45, cloudy: 22, fog: 8, "light-rain": 12, "heavy-rain": 8, storm: 5 },
  ice: { clear: 30, cloudy: 18, fog: 7, snow: 28, blizzard: 17 },
  desert: { clear: 62, cloudy: 10, sandstorm: 18, "light-rain": 6, storm: 4 },
  volcano: { clear: 32, cloudy: 16, ashfall: 30, "heavy-rain": 7, storm: 15 },
  city: { clear: 45, cloudy: 20, fog: 10, "light-rain": 12, "heavy-rain": 8, storm: 5 },
};

/** Where the weather tends to go next from each state (before the theme filters it). */
const NEXT_WEATHER: Record<WeatherKind, Partial<Record<WeatherKind, number>>> = {
  clear: { cloudy: 6, fog: 1.5, sandstorm: 1.5, ashfall: 1.5, snow: 1.5 },
  cloudy: { clear: 4, "light-rain": 4, fog: 1, snow: 3, sandstorm: 1, ashfall: 3, storm: 0.5 },
  fog: { clear: 3, cloudy: 4, "light-rain": 1 },
  "light-rain": { cloudy: 3, "heavy-rain": 3, clear: 1 },
  "heavy-rain": { "light-rain": 4, storm: 2, cloudy: 1 },
  storm: { "heavy-rain": 5, "light-rain": 1 },
  snow: { cloudy: 3, blizzard: 2, clear: 1 },
  blizzard: { snow: 5, cloudy: 1 },
  sandstorm: { clear: 3, cloudy: 2 },
  ashfall: { cloudy: 3, clear: 2, storm: 1.5, "heavy-rain": 0.5 },
};

/** Track temperature (°C) of each kind of circuit in fair weather. */
export const BASE_TEMPERATURE: Record<CircuitThemeId, number> = { forest: 24, ice: -6, desert: 44, volcano: 52, city: 28 };

/** Seconds of race between weather changes. */
const CHANGE_INTERVAL: readonly [number, number] = [55, 130];

export interface WeatherChance {
  kind: WeatherKind;
  chance: number;
}

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>, random: RandomSource): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function pickStartWeather(theme: CircuitThemeId, random: RandomSource = Math.random): WeatherKind {
  return pickWeighted(START_WEATHER[theme], random);
}

/** What the weather is likely to do next, given the theme; chances add up to 1. */
export function weatherOutlook(theme: CircuitThemeId, from: WeatherKind): WeatherChance[] {
  const allowed = START_WEATHER[theme];
  const next = Object.entries(NEXT_WEATHER[from]).filter(([kind]) => (allowed[kind as WeatherKind] ?? 0) > 0) as [WeatherKind, number][];
  const options = next.length ? next : ([["cloudy", 1]] as [WeatherKind, number][]);
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  return options.map(([kind, w]) => ({ kind, chance: w / total })).sort((a, b) => b.chance - a.chance);
}

/** State of the track surface, shared by every car. */
export interface TrackConditions {
  /** Water on the road: 0 dry - 1 flooded. */
  water: number;
  /** Loose cover (snow, sand, ash): 0 none - 1 deep. */
  loose: number;
  /** Track temperature (°C). */
  temperature: number;
}

export function dryConditions(theme: CircuitThemeId): TrackConditions {
  return { water: 0, loose: 0, temperature: BASE_TEMPERATURE[theme] };
}

/** How the sky looks right now; eased so weather arrives and leaves gradually. */
export interface WeatherLook {
  kind: WeatherKind;
  precipitation: Precipitation;
  intensity: number;
  cloud: number;
  visibility: number;
  /** Lightning flash, 1 at the strike and fading to 0. */
  flash: number;
}

const EASE = 0.12; // per second

/**
 * Weather over the course of a race: it changes now and then following the
 * theme's tendencies, wets or covers the track while it lasts and lets it
 * dry out afterwards.
 */
export class WeatherSystem {
  kind: WeatherKind;
  readonly conditions: TrackConditions;
  readonly look: WeatherLook;
  private timeToChange: number;

  constructor(
    private readonly theme: CircuitThemeId,
    private readonly random: RandomSource = Math.random,
    initial: WeatherKind = pickStartWeather(theme, random),
    settled = true,
  ) {
    this.kind = initial;
    const spec = WEATHER[initial];
    this.conditions = {
      water: settled ? spec.water : 0,
      loose: settled ? spec.loose : 0,
      temperature: BASE_TEMPERATURE[theme] + spec.tempShift,
    };
    this.look = {
      kind: initial,
      precipitation: spec.precipitation,
      intensity: spec.intensity,
      cloud: spec.cloud,
      visibility: spec.visibility,
      flash: 0,
    };
    this.timeToChange = this.nextInterval();
  }

  get spec(): WeatherSpec {
    return WEATHER[this.kind];
  }

  get outlook(): WeatherChance[] {
    return weatherOutlook(this.theme, this.kind);
  }

  private nextInterval(): number {
    return CHANGE_INTERVAL[0] + this.random() * (CHANGE_INTERVAL[1] - CHANGE_INTERVAL[0]);
  }

  step(dt: number): void {
    this.timeToChange -= dt;
    if (this.timeToChange <= 0) {
      this.timeToChange = this.nextInterval();
      const weights: Partial<Record<WeatherKind, number>> = {};
      for (const { kind, chance } of this.outlook) weights[kind] = chance;
      this.kind = pickWeighted(weights, this.random);
    }
    this.easeLook(dt);
    this.wetTrack(dt);
  }

  private easeLook(dt: number): void {
    const spec = this.spec, look = this.look, k = Math.min(1, dt * EASE);
    look.kind = this.kind;
    // Precipitation only starts to show once the new sky has arrived.
    look.intensity += (spec.intensity - look.intensity) * k;
    look.cloud += (spec.cloud - look.cloud) * k;
    look.visibility += (spec.visibility - look.visibility) * k;
    if (spec.precipitation !== "none" || look.intensity < 0.05) look.precipitation = spec.precipitation;
    look.flash = Math.max(0, look.flash - dt * 4);
    if (spec.lightning && this.random() < dt * 0.14) look.flash = 0.6 + this.random() * 0.4;
  }

  private wetTrack(dt: number): void {
    const spec = this.spec, c = this.conditions;
    const heat = Math.max(0, c.temperature - 25);
    const waterRate = spec.water > c.water ? 0.012 + 0.03 * spec.intensity : 0.004 + heat * 0.0002;
    c.water += clamp(spec.water - c.water, -waterRate * dt, waterRate * dt);
    const cold = c.temperature < 0;
    const looseRate = spec.loose > c.loose ? 0.01 + 0.02 * spec.intensity : cold ? 0.0008 : 0.003;
    c.loose += clamp(spec.loose - c.loose, -looseRate * dt, looseRate * dt);
    const target = BASE_TEMPERATURE[this.theme] + spec.tempShift;
    c.temperature += (target - c.temperature) * Math.min(1, dt * 0.02);
  }
}
