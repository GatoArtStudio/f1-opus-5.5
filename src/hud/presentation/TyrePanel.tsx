import type { HudSnapshot, PitUiState } from "@/race/application/race-ui-state";
import { COMPOUND_SPECS } from "@/tyres/domain/tyre";
import { TyreBadge } from "@/tyres/presentation/TyreBadge";
import styles from "./hud.module.css";

function pitStatus(pit: PitUiState): string | null {
  if (pit.phase === "approach") return "ENTRANDO EN BOXES";
  if (pit.phase === "service") return "EN BOXES";
  if (pit.phase === "exit") return "SALIENDO DE BOXES";
  if (pit.requested) return "BOX: al final de la vuelta";
  return null;
}

/** Player's tyres: compound, wear and grip, and the state of the pit stop. */
export function TyrePanel({ tyre, pit }: { tyre: HudSnapshot["tyre"]; pit: PitUiState | null }) {
  const status = pit && pitStatus(pit);
  const wearPct = Math.round(tyre.wear * 100);
  return (
    <div className={`${styles.panel} ${styles.tyres}`}>
      <TyreBadge compound={tyre.compound} size={38} />
      <div className={styles.tyreInfo}>
        <div className={styles.tyreName}>
          <span>{COMPOUND_SPECS[tyre.compound].label}</span>
          <small>Agarre {Math.round(tyre.grip * 100)} %</small>
        </div>
        <div className={styles.wearTrack} title={`Desgaste ${wearPct} %`}>
          <div
            className={styles.wearFill}
            style={{ width: `${Math.max(3, 100 - wearPct)}%`, background: tyre.wear > 0.75 ? "#ff4a3a" : tyre.wear > 0.5 ? "#ffb020" : "#3ddc84" }}
          />
        </div>
        {status ? (
          <div className={styles.pitStatus}>{status}</div>
        ) : pit?.rule === "pending" ? (
          <div className={styles.pitStatus}>Parada obligatoria pendiente</div>
        ) : (
          pit?.canRequest && <div className={styles.pitHint}>B · pedir boxes</div>
        )}
      </div>
    </div>
  );
}
