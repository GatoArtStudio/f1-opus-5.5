import type { RaceCar } from "@/race-car/domain/race-car";
import type { Driver } from "./driver";

/** A car taking part in a race, with its lap and timing record. */
export class RaceEntry {
  /** Current lap (0 = still behind the line on the grid). */
  lap = 0;
  /** Highest lap reached, so re-crossing the line after reversing doesn't count twice. */
  maxLap = 0;
  prevIndex = 0;
  /** Distance covered since the start line; negative on the grid. */
  progress = 0;
  position = 0;
  finished = false;
  finishTime = 0;
  lapStart = 0;
  lastLap = 0;
  bestLap = 0;

  constructor(
    readonly driver: Driver,
    readonly car: RaceCar,
    readonly grid: number,
    readonly isPlayer: boolean,
  ) {
    this.prevIndex = car.index;
  }
}
