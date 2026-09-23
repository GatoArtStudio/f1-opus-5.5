import type { WeatherInfo } from "@/race/application/race-ui-state";
import { COMPOUND_SPECS, COMPOUNDS, type Compound } from "@/tyres/domain/tyre";
import { TyreBadge } from "@/tyres/presentation/TyreBadge";
import { WEATHER_ICON } from "@/weather/presentation/weather-icon";
import styles from "./main-menu.module.css";

interface Props {
  weather: WeatherInfo;
  value: Compound | "auto";
  onChange(value: Compound | "auto"): void;
}

/** Today's weather and track, and the tyres to start on. */
export function ConditionsPanel({ weather, value, onChange }: Props) {
  const note =
    value === "auto"
      ? `El equipo monta el mejor neumático para las condiciones: ${COMPOUND_SPECS[weather.recommended].label.toLowerCase()}.`
      : COMPOUND_SPECS[value].note;
  return (
    <section className={styles.conditions} aria-label="Clima y neumáticos">
      <div className={styles.weatherRow}>
        <span className={styles.weatherEmoji} aria-hidden>{WEATHER_ICON[weather.kind]}</span>
        <div>
          <div className={styles.weatherName}>{weather.label}</div>
          <div className={styles.weatherMeta}>
            Pista {weather.surface.toLowerCase()} · {weather.temperature} °C
          </div>
        </div>
        {weather.outlook.length > 0 && (
          <div className={styles.outlook}>
            <span>Tendencia</span>
            {weather.outlook.slice(0, 2).map((o) => (
              <span key={o.label}>{o.label} {Math.round(o.chance * 100)} %</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.tyreLabel}>Neumáticos de salida</div>
      <div className={styles.tyreChips} role="radiogroup" aria-label="Neumáticos de salida">
        <button
          type="button"
          role="radio"
          aria-checked={value === "auto"}
          className={`${styles.chip} ${value === "auto" ? styles.chipOn : ""}`}
          onClick={() => onChange("auto")}
        >
          <TyreBadge compound={weather.recommended} size={22} />
          Auto
        </button>
        {COMPOUNDS.map((compound) => (
          <button
            key={compound}
            type="button"
            role="radio"
            aria-checked={value === compound}
            className={`${styles.chip} ${value === compound ? styles.chipOn : ""}`}
            onClick={() => onChange(compound)}
          >
            <TyreBadge compound={compound} size={22} />
            {COMPOUND_SPECS[compound].label}
            {compound === weather.recommended && <em title="Recomendado para las condiciones"> ★</em>}
          </button>
        ))}
      </div>
      <p className={styles.tyreNote}>{note}</p>
    </section>
  );
}
