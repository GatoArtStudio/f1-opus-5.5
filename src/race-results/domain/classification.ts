import type { Race } from "@/race/domain/race";

export type ClassifiedResult =
  | { kind: "winner"; raceTime: number }
  | { kind: "gap"; seconds: number }
  | { kind: "running"; lap: number };

export interface ClassificationRow {
  position: number;
  driverName: string;
  driverCode: string;
  color: number;
  isPlayer: boolean;
  grid: number;
  bestLap: number;
  fastestLap: boolean;
  result: ClassifiedResult;
  /** Seconds added for breaking a rule, already included in `result`. */
  penalty: number;
}

export interface Classification {
  playerPosition: number;
  rows: ClassificationRow[];
}

/** Final (or provisional, while others are still running) race order. */
export function classifyRace(race: Race): Classification {
  const standings = race.standings();
  const leader = standings[0].entry;
  const rows = standings.map(({ entry }, i): ClassificationRow => ({
    position: i + 1,
    driverName: entry.driver.name,
    driverCode: entry.driver.code,
    color: entry.driver.color,
    isPlayer: entry.isPlayer,
    grid: entry.grid,
    bestLap: entry.bestLap,
    fastestLap: race.fastestBy === entry,
    result: !entry.finished
      ? { kind: "running", lap: Math.max(1, entry.lap) }
      : i === 0
        ? { kind: "winner", raceTime: entry.classifiedTime }
        : { kind: "gap", seconds: entry.classifiedTime - leader.classifiedTime },
    penalty: entry.penalty,
  }));
  return { playerPosition: race.player.position, rows };
}
