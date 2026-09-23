import { START_LIGHT_COUNT } from "@/race/domain/start-sequence";
import styles from "./hud.module.css";

export function StartLights({ lit }: { lit: number }) {
  return (
    <div className={styles.lights} role="status" aria-label={`Semáforo: ${lit} de ${START_LIGHT_COUNT}`}>
      {Array.from({ length: START_LIGHT_COUNT }, (_, i) => (
        <div key={i} className={`${styles.pod} ${i < lit ? styles.on : ""}`}>
          <span className={styles.bulb} />
          <span className={styles.bulb} />
        </div>
      ))}
    </div>
  );
}
