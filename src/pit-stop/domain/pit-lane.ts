import type { Circuit } from "@/circuit/domain/circuit";
import { clamp } from "@/shared/domain/math";

/**
 * Pit lane along the right of the main straight. Positions are "u": metres
 * from the start line along the lap, negative before it. It sits beside the
 * track, inside the run-off, with a fast lane at `fastLateral` and the boxes
 * a little further out.
 */
export const PIT = {
  /** Where the entry road leaves the track, and where it reaches the fast lane. */
  entryStart: -250,
  laneStart: -170,
  firstBox: -110,
  /** Room for a car to pull out of its box without touching the next one. */
  boxSpacing: 16,
  fastLateral: 15,
  boxLateral: 18.6,
  /** Lateral position on rejoining the track, to the right of the racing line. */
  exitLateral: 4,
  /** 80 km/h. */
  speedLimit: 22.2,
  /** Where cars wait for the exit light, just after the last box's stretch of fast lane. */
  exitLineOffset: 4,
  /** Distance over which a car swings into or out of its box. */
  boxApproach: 10,
  /** Length of the exit road. */
  exitLength: 80,
  /** Fast lane beyond the last box. */
  laneOverrun: 30,
} as const;

const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Boxes along the lane: one per car of the biggest grid. */
export const PIT_BOXES = 20;

export class PitLane {
  readonly laneEnd: number;
  readonly exitEnd: number;
  readonly boxCount = PIT_BOXES;

  constructor(private readonly circuit: Circuit) {
    this.laneEnd = PIT.firstBox + (PIT_BOXES - 1) * PIT.boxSpacing + PIT.laneOverrun;
    this.exitEnd = this.laneEnd + PIT.exitLength;
  }

  /** Where a car waits for the exit light to turn green. */
  get exitLine(): number {
    return this.laneEnd + PIT.exitLineOffset;
  }

  /** Centre of the pit road itself (no swing into a box), for drawing it. */
  roadLateral(u: number): number {
    const start = 6;
    if (u <= PIT.entryStart) return start;
    if (u < PIT.laneStart) return start + (PIT.fastLateral - start) * smooth((u - PIT.entryStart) / (PIT.laneStart - PIT.entryStart));
    if (u >= this.laneEnd) return PIT.fastLateral + (PIT.exitLateral - PIT.fastLateral) * smooth((u - this.laneEnd) / PIT.exitLength);
    return PIT.fastLateral;
  }

  /** Distance from the start line, negative before it. */
  signed(trackDist: number): number {
    return trackDist > this.circuit.length / 2 ? trackDist - this.circuit.length : trackDist;
  }

  toLapDistance(u: number): number {
    return (u + this.circuit.length) % this.circuit.length;
  }

  boxPosition(box: number): number {
    return PIT.firstBox + box * PIT.boxSpacing;
  }

  /**
   * Where the car should be across the track at `u` on its way through the
   * pit lane. `startLateral` is where it left the track; after the stop it
   * swings back from the box to the fast lane.
   */
  lateralAt(u: number, startLateral: number, box: number, served: boolean): number {
    if (u <= PIT.entryStart) return startLateral;
    if (u < PIT.laneStart) {
      return startLateral + (PIT.fastLateral - startLateral) * smooth((u - PIT.entryStart) / (PIT.laneStart - PIT.entryStart));
    }
    if (u >= this.laneEnd) {
      return PIT.fastLateral + (PIT.exitLateral - PIT.fastLateral) * smooth((u - this.laneEnd) / PIT.exitLength);
    }
    const boxU = this.boxPosition(box);
    const into = smooth((u - (boxU - PIT.boxApproach)) / PIT.boxApproach);
    const out = smooth((u - boxU) / PIT.boxApproach);
    const swing = served ? 1 - out : into;
    return PIT.fastLateral + (PIT.boxLateral - PIT.fastLateral) * swing;
  }

  /** World point on the pit road at `u` for a car with the given state. */
  pointAt(u: number, startLateral: number, box: number, served: boolean): { x: number; z: number } {
    return this.circuit.pointAt(this.toLapDistance(u), this.lateralAt(u, startLateral, box, served));
  }
}
