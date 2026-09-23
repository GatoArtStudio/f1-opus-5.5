import styles from "./hud.module.css";

/** Shows the tow the player is getting (and the dirty air that comes with it) while it lasts. */
export function SlipstreamBadge({ tow, dirtyAir }: { tow: number; dirtyAir: number }) {
  if (tow < 0.05) return null;
  return (
    <div className={`${styles.panel} ${styles.slipstream}`} role="status">
      <div className={styles.slipstreamTitle}>
        <span>REBUFO</span>
        {dirtyAir > 0.4 && <span className={styles.dirtyAir}>AIRE SUCIO</span>}
      </div>
      <div className={styles.slipstreamTrack}>
        <div className={styles.slipstreamFill} style={{ width: `${Math.round(tow * 100)}%` }} />
      </div>
    </div>
  );
}
