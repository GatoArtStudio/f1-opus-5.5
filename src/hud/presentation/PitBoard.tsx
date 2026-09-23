import type { PitUiState } from "@/race/application/race-ui-state";
import type { PitReason } from "@/tyres/domain/pit-decision";
import { COMPOUND_SPECS } from "@/tyres/domain/tyre";
import { TyreBadge } from "@/tyres/presentation/TyreBadge";
import styles from "./hud.module.css";

const REASON: Record<PitReason, string> = {
  weather: "Ha cambiado el clima",
  wear: "Neumáticos gastados",
  mandatory: "Parada obligatoria: 2 compuestos",
};

/** The pit wall's board: "BOX, BOX" when the team wants the player in, and its confirmation. */
export function PitBoard({ pit }: { pit: PitUiState }) {
  if (pit.advice && !pit.requested && pit.phase === "none") {
    return (
      <div className={`${styles.panel} ${styles.pitBoard}`} role="alert">
        <div className={styles.pitBoardTitle}>BOX · BOX</div>
        <div className={styles.pitBoardTyre}>
          <TyreBadge compound={pit.advice.compound} size={30} />
          {COMPOUND_SPECS[pit.advice.compound].label}
        </div>
        <div className={styles.pitBoardReason}>{REASON[pit.advice.reason]}</div>
        <div className={styles.pitBoardKey}>Pulsa B para entrar</div>
      </div>
    );
  }
  if (pit.requested && pit.phase === "none") {
    return (
      <div className={`${styles.panel} ${styles.pitBoard} ${styles.pitBoardSmall}`} role="status">
        <div className={styles.pitBoardTitle}>BOX CONFIRMADO · entras al final de la vuelta</div>
      </div>
    );
  }
  return null;
}
