import { formatLapTime } from "@/shared/domain/lap-time";
import { toCssColor } from "@/shared/presentation/format";
import overlay from "@/shared/presentation/overlay.module.css";
import type { Classification, ClassifiedResult } from "../domain/classification";
import styles from "./results-screen.module.css";

function title(position: number): string {
  if (position === 1) return "¡VICTORIA!";
  if (position <= 3) return `¡PODIO! P${position}`;
  return `Terminaste P${position}`;
}

function ResultCell({ result }: { result: ClassifiedResult }) {
  switch (result.kind) {
    case "winner":
      return <>{formatLapTime(result.raceTime)}</>;
    case "gap":
      return <>+{result.seconds.toFixed(3)}</>;
    case "running":
      return <span className={overlay.dim}>en pista · V{result.lap}</span>;
  }
}

interface Props {
  classification: Classification;
  onRaceAgain(): void;
  onMenu(): void;
}

export function ResultsScreen({ classification, onRaceAgain, onMenu }: Props) {
  return (
    <div className={overlay.overlay}>
      <div className={`${overlay.card} ${overlay.wide}`}>
        <h2 className={overlay.heading}>{title(classification.playerPosition)}</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Piloto</th>
              <th>Tiempo</th>
              <th>Mejor vuelta</th>
              <th>Salida</th>
            </tr>
          </thead>
          <tbody>
            {classification.rows.map((row) => (
              <tr key={row.driverCode} className={row.isPlayer ? styles.me : undefined}>
                <td>{row.position}</td>
                <td>
                  <i className={styles.swatch} style={{ background: toCssColor(row.color) }} />
                  {row.driverName}
                  <small className={styles.code}>{row.driverCode}</small>
                </td>
                <td>
                  <ResultCell result={row.result} />
                  {row.penalty > 0 && <small className={styles.penalty}> (+{row.penalty} s pen.)</small>}
                </td>
                <td>
                  {formatLapTime(row.bestLap)}
                  {row.fastestLap && <span className={styles.fastest}> ●</span>}
                </td>
                <td>{row.grid}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={overlay.row}>
          <button type="button" className={`${overlay.button} ${overlay.primary}`} onClick={onRaceAgain}>
            Correr de nuevo
          </button>
          <button type="button" className={overlay.button} onClick={onMenu}>
            Menú principal
          </button>
        </div>
      </div>
    </div>
  );
}
