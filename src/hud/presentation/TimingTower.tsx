import type { TowerRow } from "@/race/application/race-ui-state";
import { toCssColor } from "@/shared/presentation/format";
import { formatGap } from "./format-gap";
import styles from "./hud.module.css";

export function TimingTower({ lap, totalLaps, rows }: { lap: number; totalLaps: number; rows: TowerRow[] }) {
  return (
    <aside className={styles.tower}>
      <div className={styles.towerHead}>
        <div className={styles.brand}>WEB GP</div>
        <div className={styles.lap}>
          <span>VUELTA</span> {lap}
          <small>/{totalLaps}</small>
        </div>
      </div>
      <ol className={styles.towerList}>
        {rows.map((row) => (
          <li key={row.code} className={row.isPlayer ? styles.me : undefined}>
            <b>{row.position}</b>
            <i style={{ background: toCssColor(row.color) }} />
            <span>{row.code}</span>
            <em>{formatGap(row.gap)}</em>
          </li>
        ))}
      </ol>
    </aside>
  );
}
