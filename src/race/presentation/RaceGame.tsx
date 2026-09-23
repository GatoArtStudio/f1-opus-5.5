"use client";

import { useCallback, useState } from "react";
import { Hud } from "@/hud/presentation/Hud";
import { ResultsScreen } from "@/race-results/presentation/ResultsScreen";
import { MainMenu } from "@/race-setup/presentation/MainMenu";
import type { RaceSession } from "../application/race-session";
import { createRaceGame } from "../infrastructure/create-race-game";
import { PauseMenu } from "./PauseMenu";
import styles from "./race-game.module.css";
import { useRaceUiState } from "./use-race-ui-state";

export default function RaceGame() {
  const [session, setSession] = useState<RaceSession | null>(null);
  const state = useRaceUiState(session);

  // The 3D game lives as long as its container element is mounted.
  const mountGame = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    const game = createRaceGame(container);
    setSession(game.session);
    return () => {
      setSession(null);
      game.dispose();
    };
  }, []);

  const subscribeTelemetry = useCallback(
    (listener: Parameters<RaceSession["onTelemetry"]>[0]) => session?.onTelemetry(listener) ?? (() => {}),
    [session],
  );

  return (
    <div className={styles.stage}>
      <div ref={mountGame} className={styles.viewport} />
      {!session || !state ? (
        <div className={styles.loading}>Cargando circuito…</div>
      ) : (
        <>
          {state.phase !== "menu" && state.hud && (
            <Hud
              hud={state.hud}
              startLights={state.startLights}
              message={state.message}
              outline={session.outline}
              subscribeTelemetry={subscribeTelemetry}
            />
          )}
          {state.phase === "menu" && (
            <MainMenu settings={state.settings} circuit={state.circuit} onChange={session.updateSettings} onStart={session.startRace} />
          )}
          {state.phase === "paused" && (
            <PauseMenu onResume={session.togglePause} onRestart={session.startRace} onQuit={session.quitToMenu} />
          )}
          {state.results && state.phase === "finished" && (
            <ResultsScreen
              classification={state.results}
              onRaceAgain={session.startRace}
              onMenu={session.quitToMenu}
            />
          )}
        </>
      )}
    </div>
  );
}
