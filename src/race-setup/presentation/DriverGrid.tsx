"use client";

import { DRIVER_ROSTER } from "@/race/domain/driver";
import { DRIVER_STATS, overallRating, STAT_KEYS, type StatKey } from "@/race/domain/driver-stats";
import { toCssColor } from "@/shared/presentation/format";
import styles from "./driver-grid.module.css";

const STAT_LABELS: Record<StatKey, { short: string; name: string }> = {
  pace: { short: "RIT", name: "Ritmo: velocidad punta y aceleración" },
  cornering: { short: "CUR", name: "Curva: cuánto agarre aprovecha en las curvas" },
  braking: { short: "FRE", name: "Frenada: cuánto y cuándo frena" },
  consistency: { short: "CON", name: "Constancia: línea limpia y pocos deslices" },
  aggression: { short: "AGR", name: "Agresividad: cuánto se lanza a adelantar" },
  defence: { short: "DEF", name: "Defensa: cómo evita que le adelanten" },
  wet: { short: "LLU", name: "Lluvia: ritmo con poco agarre (mojado, nieve, arena)" },
  tyres: { short: "NEU", name: "Neumáticos: desgaste y decisiones de parada" },
  start: { short: "SAL", name: "Salida: reacción cuando se apagan los semáforos" },
};

/** Colour from red (weak) to green (strong) for a stat. */
const barColor = (value: number) => `hsl(${Math.round(Math.min(1, Math.max(0, (value - 60) / 36)) * 120)} 70% 48%)`;

const ROWS = DRIVER_ROSTER.map((driver) => {
  const stats = DRIVER_STATS[driver.code];
  return { driver, stats, overall: overallRating(stats) };
}).sort((a, b) => b.overall - a.overall);

/** The bots' drivers and their stats, shown from the main menu. */
export function DriverGrid({ onClose }: { onClose(): void }) {
  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        // Keys typed here must not reach the game (Enter would start the race).
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
        role="dialog"
        aria-label="Parrilla y stats de los pilotos"
      >
        <div className={styles.head}>
          <div>
            <h2>Parrilla</h2>
            <p>
              Los pilotos rivales y lo buenos que son en cada faceta (0-100). Solo afectan a los bots: cambian un poco
              en cada carrera según la dificultad, y tú dependes de tus propias habilidades.
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} autoFocus>
            Cerrar
          </button>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th colSpan={2}>Piloto</th>
                <th title="Valor global">GEN</th>
                {STAT_KEYS.map((key) => (
                  <th key={key} title={STAT_LABELS[key].name}>{STAT_LABELS[key].short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ driver, stats, overall }) => (
                <tr key={driver.code}>
                  <td className={styles.name}>
                    <i style={{ background: toCssColor(driver.color) }} />
                    <span>{driver.name}</span>
                  </td>
                  <td className={styles.code}>{driver.code}</td>
                  <td className={styles.overall} style={{ color: barColor(overall) }}>{overall}</td>
                  {STAT_KEYS.map((key) => (
                    <td key={key} className={styles.stat} title={`${STAT_LABELS[key].name}: ${stats[key]}`}>
                      <b>{stats[key]}</b>
                      <span className={styles.bar}>
                        <span style={{ width: `${stats[key]}%`, background: barColor(stats[key]) }} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
