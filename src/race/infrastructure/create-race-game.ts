import { WebAudioEngineSound } from "@/engine-sound/infrastructure/web-audio-engine-sound";
import { KeyboardGamepadControls } from "@/player-controls/infrastructure/keyboard-gamepad-controls";
import { RaceSession } from "../application/race-session";
import { startAnimationLoop } from "./animation-loop";
import { ThreeRaceView } from "./three-race-view";

export interface RaceGame {
  session: RaceSession;
  dispose(): void;
}

/** Composition root: wires the browser adapters into a running session. */
export function createRaceGame(container: HTMLElement): RaceGame {
  const view = new ThreeRaceView(container);
  const controls = new KeyboardGamepadControls();
  const sound = new WebAudioEngineSound();
  const session = new RaceSession(view, controls, sound);

  const stopLoop = startAnimationLoop((dt) => session.tick(dt));
  const onVisibilityChange = () => {
    if (document.hidden) session.pause();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    session,
    dispose() {
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      session.dispose();
      controls.dispose();
      sound.dispose();
      view.dispose();
    },
  };
}
