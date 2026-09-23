import type { WeatherInfo } from "@/race/application/race-ui-state";
import { WEATHER_ICON } from "@/weather/presentation/weather-icon";
import styles from "./hud.module.css";

export function WeatherBadge({ weather }: { weather: WeatherInfo }) {
  return (
    <div className={`${styles.panel} ${styles.weather}`}>
      <span className={styles.weatherIcon} aria-hidden>{WEATHER_ICON[weather.kind]}</span>
      <div>
        <div className={styles.weatherLabel}>{weather.label}</div>
        <div className={styles.weatherSurface}>
          Pista {weather.surface.toLowerCase()} · {weather.temperature} °C
        </div>
      </div>
    </div>
  );
}
