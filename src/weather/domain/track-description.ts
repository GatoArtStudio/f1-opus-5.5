import type { CircuitThemeId } from "@/circuit/domain/circuit-theme";
import type { TrackConditions } from "./weather";

/** What covers the road when there is loose cover, by kind of circuit. */
const COVER_LABEL: Record<CircuitThemeId, string> = {
  forest: "Nieve",
  ice: "Nevada",
  desert: "Arena",
  volcano: "Ceniza",
  city: "Nieve",
};

/** Plain-language state of the road for the HUD and the menu. */
export function describeSurface(conditions: TrackConditions, theme: CircuitThemeId): string {
  if (conditions.loose > 0.15) return `${COVER_LABEL[theme]}${conditions.loose > 0.65 ? " (espesa)" : ""}`;
  if (conditions.water > 0.6) return "Encharcada";
  if (conditions.water > 0.3) return "Mojada";
  if (conditions.water > 0.08) return "Húmeda";
  return "Seca";
}
