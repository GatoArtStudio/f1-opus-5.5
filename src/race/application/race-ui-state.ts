import type { Classification } from "@/race-results/domain/classification";
import type { Gear } from "@/race-car/domain/car-specs";
import type { RaceSettings } from "@/race-setup/domain/race-settings";
import type { Gap } from "../domain/race";

export type RacePhase = "menu" | "countdown" | "racing" | "paused" | "finished";

export interface TowerRow {
  position: number;
  code: string;
  color: number;
  isPlayer: boolean;
  gap: Gap;
}

/** Everything the HUD shows, refreshed a few times per second. */
export interface HudSnapshot {
  speedKmh: number;
  gear: Gear;
  position: number;
  carCount: number;
  lap: number;
  totalLaps: number;
  currentLap: number;
  lastLap: number;
  bestLap: number;
  wrongWay: boolean;
  tower: TowerRow[];
}

export type MessageTone = "big" | "go" | "fastest" | "info";

export interface RaceMessage {
  id: number;
  text: string;
  tone: MessageTone;
  seconds: number;
}

export interface CircuitInfo {
  name: string;
  lengthKm: number;
  themeLabel: string;
  /** Height between the lowest and highest point of the track, in metres. */
  climb: number;
  tunnels: number;
}

export interface RaceUiState {
  phase: RacePhase;
  settings: RaceSettings;
  circuit: CircuitInfo;
  hud: HudSnapshot | null;
  startLights: { lit: number; visible: boolean };
  message: RaceMessage | null;
  results: Classification | null;
}

/** Per-frame data for canvas widgets (minimap, rev counter). */
export interface LiveTelemetry {
  cars: { x: number; z: number; color: number; isPlayer: boolean }[];
  player: { x: number; z: number; heading: number; rpm: number };
}

export interface CircuitOutline {
  xs: Float32Array;
  zs: Float32Array;
}
