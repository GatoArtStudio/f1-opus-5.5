import type { GameAction, PlayerControls } from "@/race/application/ports";
import type { CarControls } from "@/race-car/domain/car-controls";
import { clamp } from "@/shared/domain/math";

const KEYS = {
  throttle: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown", "Space"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

const ACTION_KEYS: Record<GameAction, string[]> = {
  pause: ["Escape", "KeyP"],
  camera: ["KeyC"],
  mute: ["KeyM"],
  respawn: ["KeyR"],
  start: ["Enter"],
};

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

/** Keyboard + standard gamepad mapped to analogue throttle / brake / steer. */
export class KeyboardGamepadControls implements PlayerControls {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private steer = 0;

  constructor(private readonly target: Window = window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Let form controls in menus keep their keyboard behaviour (e.g. typing a seed).
    if (
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => this.down.delete(e.code);

  private onBlur = () => this.down.clear();

  private any(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  consumeAction(action: GameAction): boolean {
    let hit = false;
    for (const code of ACTION_KEYS[action]) {
      if (this.pressed.delete(code)) hit = true;
    }
    return hit;
  }

  clearActions(): void {
    this.pressed.clear();
  }

  read(dt: number): CarControls {
    let throttle = this.any(KEYS.throttle) ? 1 : 0;
    let brake = this.any(KEYS.brake) ? 1 : 0;
    const want = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0);

    // Keyboard steering ramps in and returns to centre smoothly.
    const rate = want === 0 || Math.sign(want) !== Math.sign(this.steer) ? 6 : 3.2;
    this.steer += clamp(want - this.steer, -rate * dt, rate * dt);
    let steer = this.steer;

    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (pad) {
      const axis = pad.axes[0] ?? 0;
      if (Math.abs(axis) > 0.12) steer = Math.sign(axis) * ((Math.abs(axis) - 0.12) / 0.88) ** 1.4;
      const rt = pad.buttons[7]?.value ?? 0, lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.05) throttle = Math.max(throttle, rt);
      if (lt > 0.05) brake = Math.max(brake, lt);
      if (pad.buttons[0]?.pressed) throttle = 1;
      if (pad.buttons[1]?.pressed) brake = 1;
    }
    return { throttle, brake, steer: clamp(steer, -1, 1) };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
  }
}
