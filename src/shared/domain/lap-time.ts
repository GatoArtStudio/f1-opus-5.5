/** m:ss.mmm, or dashes when there is no time yet. */
export function formatLapTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "--:--.---";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}
