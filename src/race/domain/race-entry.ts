import { PitStop } from "@/pit-stop/domain/pit-stop";
import { isDryCompound } from "@/tyres/domain/pit-decision";
import type { Compound } from "@/tyres/domain/tyre";
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
  /** Pit stop request and progress; the box is the one for this grid slot. */
  readonly pit: PitStop;
  /** Dry compounds used so far, for the two-compound rule. */
  readonly dryCompounds = new Set<Compound>();
  /** Seconds added to the race time for breaking a rule. */
  penalty = 0;

  constructor(
    readonly driver: Driver,
    readonly car: RaceCar,
    readonly grid: number,
    readonly isPlayer: boolean,
  ) {
    this.prevIndex = car.index;
    this.pit = new PitStop(grid - 1);
    this.noteTyre();
  }

  /** Race time including penalties; this is what the classification goes by. */
  get classifiedTime(): number {
    return this.finishTime + this.penalty;
  }

  /** Records the compound now fitted, for the two-compound rule. */
  noteTyre(): void {
    const { compound } = this.car.tyre;
    if (isDryCompound(compound)) this.dryCompounds.add(compound);
  }
}
