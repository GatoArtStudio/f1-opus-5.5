"use client";

import type { CircuitOutline, HudSnapshot, PitUiState, RaceMessage, WeatherInfo } from "@/race/application/race-ui-state";
import styles from "./hud.module.css";
import { Minimap } from "./Minimap";
import { PitBoard } from "./PitBoard";
import { PositionPanel } from "./PositionPanel";
import { RaceMessageBanner } from "./RaceMessageBanner";
import { SlipstreamBadge } from "./SlipstreamBadge";
import { Speedometer } from "./Speedometer";
import { StartLights } from "./StartLights";
import { TimingTower } from "./TimingTower";
import { TyrePanel } from "./TyrePanel";
import { WeatherBadge } from "./WeatherBadge";
import type { TelemetrySubscription } from "./use-telemetry-canvas";

interface Props {
  hud: HudSnapshot;
  weather: WeatherInfo;
  pit: PitUiState | null;
  startLights: { lit: number; visible: boolean };
  message: RaceMessage | null;
  outline: CircuitOutline;
  subscribeTelemetry: TelemetrySubscription;
}

export function Hud({ hud, weather, pit, startLights, message, outline, subscribeTelemetry }: Props) {
  return (
    <div className={styles.hud}>
      <TimingTower lap={hud.lap} totalLaps={hud.totalLaps} rows={hud.tower} />
      <Minimap outline={outline} subscribe={subscribeTelemetry} />
      {startLights.visible && <StartLights lit={startLights.lit} />}
      {message && <RaceMessageBanner key={message.id} message={message} />}
      {hud.wrongWay && <div className={styles.wrongWay}>⟲ DIRECCIÓN CONTRARIA</div>}
      <PositionPanel
        position={hud.position}
        carCount={hud.carCount}
        currentLap={hud.currentLap}
        lastLap={hud.lastLap}
        bestLap={hud.bestLap}
      />
      {pit && <PitBoard pit={pit} />}
      <WeatherBadge weather={weather} />
      <TyrePanel tyre={hud.tyre} pit={pit} />
      <SlipstreamBadge tow={hud.slipstream} dirtyAir={hud.dirtyAir} />
      <Speedometer speedKmh={hud.speedKmh} gear={hud.gear} subscribe={subscribeTelemetry} />
      <div className={styles.hint}>C cámara · R recolocar · M sonido · Esc pausa</div>
    </div>
  );
}
