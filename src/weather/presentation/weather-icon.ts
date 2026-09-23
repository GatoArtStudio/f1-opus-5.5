import type { WeatherKind } from "../domain/weather";

export const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: "☀️",
  cloudy: "☁️",
  fog: "🌫️",
  "light-rain": "🌦️",
  "heavy-rain": "🌧️",
  storm: "⛈️",
  snow: "🌨️",
  blizzard: "❄️",
  sandstorm: "🌪️",
  ashfall: "🌋",
};
