import type { Circuit } from "@/circuit/domain/circuit";
import type { CarControls } from "@/race-car/domain/car-controls";
import type { Race } from "../domain/race";

export type GameAction = "pause" | "camera" | "mute" | "respawn" | "start";

/** Human input source (keyboard, gamepad…). */
export interface PlayerControls {
  read(dt: number): CarControls;
  /** True once per press of the key bound to `action`. */
  consumeAction(action: GameAction): boolean;
  clearActions(): void;
  dispose(): void;
}

export interface EngineSound {
  readonly muted: boolean;
  /** Must be called from a user gesture (browser autoplay rules). */
  start(): void;
  setMuted(muted: boolean): void;
  update(rpm: number, throttle: number, active: boolean): void;
  impact(strength: number): void;
  dispose(): void;
}

export type CameraMode = "chase" | "far-chase" | "onboard";

export interface RenderFrame {
  race: Race;
  /** "attract" orbits the leader behind the main menu. */
  camera: CameraMode | "attract";
  shake: number;
}

/** 3D presentation of a race. */
export interface RaceView {
  /** Replaces the circuit being shown. Must be called before the first `showRace`. */
  setCircuit(circuit: Circuit): void;
  showRace(race: Race): void;
  setStartLights(lit: number): void;
  render(dt: number, frame: RenderFrame): void;
  dispose(): void;
}
