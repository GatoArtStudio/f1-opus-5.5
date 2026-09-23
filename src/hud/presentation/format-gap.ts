import type { Gap } from "@/race/domain/race";

export function formatGap(gap: Gap): string {
  switch (gap.kind) {
    case "leader":
      return gap.finished ? "FIN" : "LÍDER";
    case "time":
      return "+" + gap.seconds.toFixed(gap.precise ? 3 : 1);
    case "laps":
      return `+${gap.laps} V`;
    case "unknown":
      return "";
  }
}
