import { formatLapTime } from "@/shared/domain/lap-time";
import styles from "./hud.module.css";

interface Props {
  position: number;
  carCount: number;
  currentLap: number;
  lastLap: number;
  bestLap: number;
}

export function PositionPanel({ position, carCount, currentLap, lastLap, bestLap }: Props) {
  return (
    <div className={`${styles.panel} ${styles.positionPanel}`}>
      <div className={styles.position}>
        <span className={styles.positionP}>P</span>
        <span className={styles.positionValue}>{position}</span>
        <span className={styles.positionTotal}>/{carCount}</span>
      </div>
      <dl className={styles.times}>
        <dt>ACTUAL</dt>
        <dd>{formatLapTime(currentLap)}</dd>
        <dt>ÚLTIMA</dt>
        <dd>{formatLapTime(lastLap)}</dd>
        <dt>MEJOR</dt>
        <dd className={styles.best}>{formatLapTime(bestLap)}</dd>
      </dl>
    </div>
  );
}
